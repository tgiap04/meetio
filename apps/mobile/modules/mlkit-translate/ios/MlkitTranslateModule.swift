import ExpoModulesCore
import MLKitTranslate

struct DownloadOptions: Record {
  @Field var wifiOnly: Bool = false
}

/// Google ML Kit on-device translation. Language codes are ML Kit's ("vi", "en"); the JS wrapper
/// maps the app's BCP-47 tags. One Translator is kept per source/target pair.
public class MlkitTranslateModule: Module {
  private var translators: [String: Translator] = [:]
  private let lock = NSLock()

  private func translator(source: String, target: String) -> Translator {
    lock.lock()
    defer { lock.unlock() }
    let key = "\(source)>\(target)"
    if let cached = translators[key] { return cached }
    let options = TranslatorOptions(
      sourceLanguage: TranslateLanguage(rawValue: source),
      targetLanguage: TranslateLanguage(rawValue: target)
    )
    let created = Translator.translator(options: options)
    translators[key] = created
    return created
  }

  private func model(_ language: String) -> TranslateRemoteModel {
    TranslateRemoteModel.translateRemoteModel(language: TranslateLanguage(rawValue: language))
  }

  public func definition() -> ModuleDefinition {
    Name("MlkitTranslate")

    AsyncFunction("isModelDownloaded") { (language: String) -> Bool in
      ModelManager.modelManager().isModelDownloaded(self.model(language))
    }

    AsyncFunction("downloadModel") { (language: String, options: DownloadOptions, promise: Promise) in
      let conditions = ModelDownloadConditions(
        allowsCellularAccess: !options.wifiOnly,
        allowsBackgroundDownloading: true
      )
      let remote = self.model(language)
      // Already on the phone: ML Kit would send no notification, so resolve right away.
      if ModelManager.modelManager().isModelDownloaded(remote) {
        promise.resolve(nil)
        return
      }
      // ML Kit's iOS download() has no completion handler: it reports through notifications.
      var observers: [NSObjectProtocol] = []
      var finished = false
      let finish: (Error?) -> Void = { error in
        if finished { return }
        finished = true
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        if let error {
          promise.reject("ERR_MODEL_DOWNLOAD", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
      let matches: (Notification) -> Bool = { note in
        (note.userInfo?[ModelDownloadUserInfoKey.remoteModel.rawValue] as? TranslateRemoteModel) == remote
      }
      observers.append(NotificationCenter.default.addObserver(forName: .mlkitModelDownloadDidSucceed, object: nil, queue: nil) { note in
        if matches(note) { finish(nil) }
      })
      observers.append(NotificationCenter.default.addObserver(forName: .mlkitModelDownloadDidFail, object: nil, queue: nil) { note in
        if matches(note) {
          finish((note.userInfo?[ModelDownloadUserInfoKey.error.rawValue] as? Error) ?? NSError(domain: "MlkitTranslate", code: 1))
        }
      })
      ModelManager.modelManager().download(remote, conditions: conditions)
    }

    AsyncFunction("deleteModel") { (language: String, promise: Promise) in
      ModelManager.modelManager().deleteDownloadedModel(self.model(language)) { error in
        if let error {
          promise.reject("ERR_MODEL_DELETE", error.localizedDescription)
        } else {
          promise.resolve(nil)
        }
      }
    }

    AsyncFunction("translate") { (text: String, source: String, target: String, promise: Promise) in
      // Never download implicitly: a missing pack must surface so the user chooses when to spend data.
      self.translator(source: source, target: target).translate(text) { result, error in
        if let error {
          promise.reject("ERR_TRANSLATE", error.localizedDescription)
        } else {
          promise.resolve(result ?? "")
        }
      }
    }

    OnDestroy {
      self.lock.lock()
      self.translators.removeAll()
      self.lock.unlock()
    }
  }
}
