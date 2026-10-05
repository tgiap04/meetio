# Research: Android advanced libs (Expo SDK 57 / RN 0.86.3 / New Arch) — 2026-10-05

Sources: npm registry, GitHub (repos/READMEs/CHANGELOG/issues via gh), docs.expo.dev, developer.android.com, local node_modules source of react-native-background-actions. Credibility: all primary (official/maintainer). Not device-tested.

## Summary ranking
| # | Feature | Pick | Risk |
|---|---|---|---|
| 1 | Biometric | expo-local-authentication 57.0.3 | low |
| 2 | Shortcuts | expo-quick-actions (npm 6.0.2; 6.1.0 = SDK57 build is on git only) ; fallback custom static shortcuts plugin | low-med (npm gap) |
| 3 | Widget | react-native-android-widget 0.22.1 | med (New Arch/0.86 unverified by maintainer; 2 open click/size issues) |
| 4 | Notif actions | PATCH react-native-background-actions (yarn patch, precedent exists); alt react-native-notify-kit 10.8.0 | low-med |
| 5 | Call auto-pause | Own Kotlin Expo Module: AudioManager.OnModeChangedListener (API31+, no permission) | med |

## 1. Biometric — expo-local-authentication `57.0.3` (dist-tag sdk-57/latest, 2026-10-01)
- Config plugin: only `faceIDPermission` (iOS). Android manifest gets `USE_BIOMETRIC` (+ deprecated `USE_FINGERPRINT`) automatically. No plugin needed for Android.
- API: `hasHardwareAsync()`, `isEnrolledAsync()`, `getEnrolledLevelAsync()` -> NONE|SECRET|BIOMETRIC_WEAK|BIOMETRIC_STRONG, `authenticateAsync({promptMessage, cancelLabel, disableDeviceFallback, biometricsSecurityLevel:'strong'|'weak', requireConfirmation})`. `fallbackLabel` iOS-only.
- Result `{success:true}` | `{success:false,error}`; errors: not_enrolled, user_cancel, app_cancel, not_available, lockout, timeout, system_cancel, user_fallback, passcode_not_set, authentication_failed...
- Device PIN only (no fingerprint enrolled): `hasHardwareAsync` may be true/false per device, `isEnrolledAsync` = false (biometric only), `getEnrolledLevelAsync` = SECRET. `authenticateAsync` with default options (disableDeviceFallback false) shows prompt w/ device credential (PIN/pattern) fallback -> works. With `disableDeviceFallback:true` -> biometric only -> error not_enrolled. Docs state disableDeviceFallback maps to the iOS biometrics-only policy; Android effect is inferred from error list, verify on device.
- Recommend: gate on `getEnrolledLevelAsync() !== NONE` (not isEnrolled) so PIN-only phones can still enable lock; keep default fallback allowed (spec: fallback PIN).
```ts
import * as LA from 'expo-local-authentication';
const level = await LA.getEnrolledLevelAsync();           // NONE => hide toggle
const r = await LA.authenticateAsync({ promptMessage: 'Mở Meetio', cancelLabel: 'Huỷ' });
if (!r.success && r.error !== 'user_cancel') {/* retry/handle lockout */}
```
- Gotcha: JS-side app-state timer (30s) is our logic; system prompt itself triggers AppState `inactive/background`-ish transitions -> guard re-lock loop with an "authenticating" flag. Don't lock while recording (US-02).

## 2. App Shortcuts
Options:
| Option | Static | Dynamic | expo-router | Maint. | Notes |
|---|---|---|---|---|---|
| expo-quick-actions (EvanBacon) | NO on Android (README: "not supported, no complex intent"); iOS static only | yes, `setItems` (ShortcutManager) | yes, `useQuickActionRouting` + `params.href` | active (SDK57 commit 2026-09-25) | **npm latest 6.0.2 (SDK 56)**; README table says SDK57 -> 6.1.0, `npm view expo-quick-actions@6.1.0` = 404. peer `expo:*` so 6.0.2 installs; likely fine on 57 but unverified |
| react-native-quick-actions | - | - | - | dead (2022) | reject |
| Custom config plugin: `res/xml/shortcuts.xml` + manifest meta-data, intent VIEW `meetio://...` | yes | no | free (Linking) | ours (~40 lines) | zero runtime dep; simple; the existing repo already writes plugins |
Rank: 1) expo-quick-actions@6.0.2 (try; if build/runtime breaks, install from git `EvanBacon/expo-quick-actions#main`, or drop to 3). 2) git main (6.1.0, SDK57-aligned). 3) custom static plugin (KISS fallback, still valid ShortcutManager/static-shortcut demo; can add dynamic via Kotlin later).
- Icons Android: plugin `androidIcons: { rec: { foregroundImage: './assets/sc-rec.png', backgroundColor: '#fff' } }` (adaptive-icon style, generated like android.adaptiveIcon; foreground ~108dp w/ safe zone 66dp, PNG transparent). `icon` field in action = key. Max count read via `QuickActions.maxCount` (Android launcher-dependent; recommend <=4).
```tsx
// app/_layout.tsx
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting, RouterAction } from 'expo-quick-actions/router';
useQuickActionRouting();               // navigates router to params.href on press (cold + warm)
useEffect(() => { QuickActions.setItems<RouterAction>([
  { id:'rec', title:'Ghi mới', icon:'rec', params:{ href:'/recording-live' } },
  { id:'ask', title:'Hỏi AI',  icon:'ask', params:{ href:'/ask' } } ]); }, []);
```
- Caveat: dynamic shortcuts exist only after app first launch; hook must sit in a layout that mounts before auth redirect (else href lost). Routing through biometric lock: let lock screen gate, store pending href.

## 3. Widget — react-native-android-widget `0.22.1` (2026-08-17; repo sAleksovski/..., ~900 stars, pushed 2026-09-20, 0.19->0.22 releases monthly)
- Expo config plugin: yes (`['react-native-android-widget', { fonts?, widgets:[{name, label, description, minWidth, minHeight, targetCellWidth, targetCellHeight, previewImage, updatePeriodMillis}] }]`). peer `expo>=54`, `react-native:*`; dev'd on RN 0.83/Expo 54. CHANGELOG: "Working with new architecture" since RN 0.76; "Support for RN 0.83". Issue #131 (registerWidgetTaskHandler vs ReactNativeHost deprecation on RN 0.83) CLOSED/fixed. RN 0.86 NOT explicitly claimed -> verify with a prebuild + widget add early (day 1).
- How it works (limitations.md): JS renders primitives (FlexWidget/TextWidget/...) -> image/RemoteViews; no real RN views. Size mismatch on some launchers (open issue #34).
- Open issue #154 (2026-09-18): clicks stop after re-render (PendingIntent clock-derived request code + FLAG_CANCEL_CURRENT) — affects tap reliability after updates; check before demo.
- updatePeriodMillis min 1800000 (30 min), 0 = none. Also WIDGET_UPDATE can come from native `RNWidgetJsCommunication.requestWidgetUpdate` (broadcast/alarm/push).
- Task handler (headless): `registerWidgetTaskHandler(handler)` in entry (`index.ts`/ before expo-router/entry: with `main: expo-router/entry`, create a custom `index.js` importing handler then `import 'expo-router/entry'`). Actions: WIDGET_ADDED | WIDGET_UPDATE | WIDGET_RESIZED | WIDGET_DELETED | WIDGET_CLICK.
- Click: `clickAction="OPEN_APP"` (no data) or `clickAction="OPEN_URI" clickActionData={{uri:'meetio://recording-live'}}` -> executed natively, no JS needed; custom string -> emitted to task handler as WIDGET_CLICK (JS headless, Android 7+). Use OPEN_URI for ● Ghi button (deep link works cold-start via expo-router).
```tsx
// widget/task-handler.tsx
export async function widgetTaskHandler(p: WidgetTaskHandlerProps) {
  if (['WIDGET_ADDED','WIDGET_UPDATE','WIDGET_RESIZED'].includes(p.widgetAction))
    p.renderWidget(<MeetioWidget todos={await readTodoCount()} />);   // read SQLite
}
// app: after data changes
requestWidgetUpdate({ widgetName:'Meetio', renderWidget:()=> <MeetioWidget .../>, widgetNotFound:()=>{} });
```
- Headless JS reads SQLite (expo-sqlite) — fine; avoid zustand store (no app state in headless). Don't use API calls needing auth tokens without secure-store read.
- Alternatives if incompatible: (a) write native Glance/RemoteViews AppWidgetProvider via own config plugin (more Kotlin, max control, ~1 day extra); (b) expo-widgets (Expo's own) is iOS-focused — not verified for Android, did not research. Fallback = (a).

## 4. Notification actions on the foreground-service notification
- react-native-background-actions 4.1.0 (last push 2026-04-07): **no action-button support**. Verified in local source `RNBackgroundActionsTask.buildNotification`: builder has only title/text/icon/contentIntent(linkingURI)/ongoing/priority/color/progress; no `addAction`. Issue #60 "How to add action button" is OPEN, enhancement, no impl. Foreground type read from options (microphone OK).
- @notifee/react-native 9.1.8: **archived Apr 2026** (last release Dec 2024); README says migrate to expo-notifications or fork react-native-notify-kit. Old-arch bridge -> reject.
- react-native-notify-kit **10.8.0** (marcocrupi, fork, pushed 2026-10-02, 0 open issues, 214 stars; single maintainer): New Arch only (TurboModules), Expo CNG config plugin, `asForegroundService`, actions, `onBackgroundEvent`; peer RN>=0.73, dev target 0.85.3 (0.86 untested). Requires own `foregroundServiceType` on its service in manifest (microphone); `ongoing` default true for FGS. Cost: replace background-actions entirely (its keep-alive headless task semantics, linkingURI, update logic) — re-verify all recording background behaviour on device.
- expo-notifications 57.0.21: `setNotificationCategoryAsync` + `categoryIdentifier` works for local scheduled notifications (buttons, `opensAppToForeground:false`; on Android action tap while app bg/killed runs a TaskManager task via `registerTaskAsync`). BUT: no foreground-service API, no `ongoing/sticky` in JS API -> cannot be the FGS notification; would be a 2nd duplicate notification. Reject for this purpose.
- Patch option (recommended): app already uses a yarn patch (expo-speech-recognition) -> precedent. Patch `buildNotification` (also used by `updateNotification`, so Pause<->Resume label toggle via `BackgroundService.updateNotification({taskDesc, ...custom opt})`):
```java
// in buildNotification, read e.g. extras "actions": ArrayList<String> ids, "actionLabels"
for (...) {
  Intent i = new Intent(ACTION_PREFIX + id).setPackage(context.getPackageName());
  builder.addAction(0, label, PendingIntent.getBroadcast(context, id.hashCode(), i,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
}
// register a RECEIVER_NOT_EXPORTED BroadcastReceiver in the service/module -> emit
// RCTDeviceEventEmitter "BackgroundActionsButton" {id}; JS: DeviceEventEmitter.addListener(...)
```
  ~60-80 lines Java+TS typing. Receiver must be registered while service alive (dynamic, ok since recording needs JS alive anyway). Limit: if JS context dead the button is a no-op (acceptable; recording is also dead).
- Rank: 1) patch (smallest blast radius, keeps working FGS); 2) notify-kit swap (cleaner API, larger regression surface, 1 maintainer); 3) expo-notifications (not viable); 4) notifee (archived).
- Android 14+ note: user can swipe-dismiss FGS notification; fine. Declare actions with `FLAG_IMMUTABLE` (API 31 req).

## 5. Auto-pause on incoming call
Signals:
| Signal | Permission | API | Covers | Reliability |
|---|---|---|---|---|
| `AudioManager.addOnModeChangedListener` (MODE_RINGTONE=1 / IN_CALL=2 / IN_COMMUNICATION=3 / NORMAL=0) | none (docs) | 31+ | cellular ring+call, many VoIP | best; fires at ring |
| `getMode()` polling (1s) | none | all | same | fallback <31; 0-1s latency |
| AudioFocus listener (LOSS_TRANSIENT) | none | all | calls, also music/nav/any app | must hold focus (steals from music players = side effect); SpeechRecognizer may not hold focus itself, so we'd have to request it |
| TelephonyCallback.CallStateListener (31+) / PhoneStateListener | READ_PHONE_STATE (dangerous, runtime) | 31+ / legacy | cellular only | precise, but permission prompt; denied = broken |
- Rank: 1) ModeChanged listener (+ getMode poll when SDK<31); 2) AudioFocus (add if wanted for non-call interruptions; opt-in); 3) Telephony (only if grader wants READ_PHONE_STATE demo).
- Inference (not doc-verified): on Android 10+ the mic is silenced/taken during a call, so SpeechRecognizer/AudioRecord yield silence or errors -> explicit pause beats silent gap. Both recorders (SpeechRecognizer, expo-audio) are agnostic: JS handler calls the existing pause. Verify on real phone that our own recording doesn't flip mode to IN_COMMUNICATION (WebRTC-style; shouldn't).
- Treat 1(RINGTONE) and 2 as pause; 3 (VoIP, e.g. Zalo/Messenger call) also pause (state "interrupted"); NORMAL -> emit `resume` (let JS decide auto-resume vs ask).
- Kotlin sketch (Expo Modules API; add to new module `modules/call-state` or extend mlkit-translate — prefer new module, KISS single purpose; register in expo-module.config.json android.modules):
```kotlin
package expo.modules.callstate
import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class CallStateModule : Module() {
  private val ctx get() = appContext.reactContext ?: throw IllegalStateException("no ctx")
  private val am get() = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private var listener: AudioManager.OnModeChangedListener? = null
  private var poller: Runnable? = null
  private val main = Handler(Looper.getMainLooper())
  private var last = -1

  private fun emit(mode: Int) {
    if (mode == last) return; last = mode
    val inCall = mode == AudioManager.MODE_RINGTONE || mode == AudioManager.MODE_IN_CALL ||
                 mode == AudioManager.MODE_IN_COMMUNICATION
    sendEvent("onCallStateChange", mapOf("active" to inCall, "mode" to mode))
  }

  override fun definition() = ModuleDefinition {
    Name("CallState")
    Events("onCallStateChange")
    Function("currentMode") { am.mode }
    Function("start") {
      if (listener != null || poller != null) return@Function
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        listener = AudioManager.OnModeChangedListener { emit(it) }
        am.addOnModeChangedListener(ctx.mainExecutor, listener!!)
      } else {
        poller = object : Runnable { override fun run() { emit(am.mode); main.postDelayed(this, 1000) } }
        main.post(poller!!)
      }
    }
    Function("stop") { cleanup() }
    OnDestroy { cleanup() }
  }
  private fun cleanup() {
    listener?.let { am.removeOnModeChangedListener(it) }; listener = null
    poller?.let { main.removeCallbacks(it) }; poller = null; last = -1
  }
}
```
JS: `requireNativeModule('CallState')`, `new EventEmitter(mod).addListener('onCallStateChange', e => e.active ? pause('call') : maybeResume())`. Listener runs in app process; process is kept alive by the FGS -> works with screen off. No manifest changes, no config plugin.
- Edge: ringing but user declines -> NORMAL -> auto-resume only if we paused due to call (flag), not user-paused.

## Limits / unresolved
- Nothing device-tested; Android effect of disableDeviceFallback, widget on RN 0.86, expo-quick-actions@6.0.2 on SDK 57, ModeChanged behaviour per vendor (MIUI/Samsung) all need real-device check.
- expo-quick-actions 6.1.0 absent on npm: confirm via `yarn npm info` later / maintainer may publish; otherwise git dependency.
- Did not evaluate Expo's own widget package, react-native-android-widget's New Arch via source (only changelog/issues).
- minSdk of the app not confirmed (assumed 24+ Expo default); affects API31 branch only.
- Q: patch vs notify-kit — decide by appetite for Java patch (~1 day) vs regression-testing FGS swap.
