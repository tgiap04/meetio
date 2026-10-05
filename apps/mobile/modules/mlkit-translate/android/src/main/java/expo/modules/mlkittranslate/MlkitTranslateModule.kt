package expo.modules.mlkittranslate

import com.google.android.gms.tasks.Task
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.util.concurrent.ConcurrentHashMap

class DownloadOptions : Record {
  @Field
  val wifiOnly: Boolean = false
}

/**
 * Google ML Kit on-device translation. Language codes are ML Kit's ("vi", "en"); the JS wrapper maps
 * the app's BCP-47 tags. One Translator is kept per source/target pair and closed with the module.
 */
class MlkitTranslateModule : Module() {
  private val models = RemoteModelManager.getInstance()
  private val translators = ConcurrentHashMap<String, Translator>()

  private fun modelFor(language: String) = TranslateRemoteModel.Builder(language).build()

  private fun translatorFor(source: String, target: String): Translator =
    translators.getOrPut("$source>$target") {
      Translation.getClient(
        TranslatorOptions.Builder().setSourceLanguage(source).setTargetLanguage(target).build()
      )
    }

  /** Settles the JS promise from a Play-services task — failures carry ML Kit's own message. */
  private fun <T> Task<T>.settle(promise: Promise, code: String, map: (T) -> Any?) {
    addOnSuccessListener { promise.resolve(map(it)) }
    addOnFailureListener { promise.reject(code, it.message ?: code, it) }
  }

  override fun definition() = ModuleDefinition {
    Name("MlkitTranslate")

    AsyncFunction("isModelDownloaded") { language: String, promise: Promise ->
      models.isModelDownloaded(modelFor(language)).settle(promise, "ERR_MODEL_CHECK") { it }
    }

    AsyncFunction("downloadModel") { language: String, options: DownloadOptions, promise: Promise ->
      val conditions = DownloadConditions.Builder().apply { if (options.wifiOnly) requireWifi() }.build()
      // ML Kit exposes no download progress on Android; the JS side shows an indeterminate state.
      models.download(modelFor(language), conditions).settle(promise, "ERR_MODEL_DOWNLOAD") { null }
    }

    AsyncFunction("deleteModel") { language: String, promise: Promise ->
      models.deleteDownloadedModel(modelFor(language)).settle(promise, "ERR_MODEL_DELETE") { null }
    }

    AsyncFunction("translate") { text: String, source: String, target: String, promise: Promise ->
      // Never download implicitly: a missing pack must surface so the user chooses when to spend data.
      translatorFor(source, target).translate(text).settle(promise, "ERR_TRANSLATE") { it }
    }

    OnDestroy {
      translators.values.forEach { it.close() }
      translators.clear()
    }
  }
}
