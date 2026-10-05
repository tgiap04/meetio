package expo.modules.callstate

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Tells JS when the phone is ringing or in a call — cellular or VoIP (Zalo, Messenger, Meet) — so a
 * recording can pause itself. Reads only the audio mode: no READ_PHONE_STATE, no call log, no number.
 * API 31+ gets mode-change callbacks; older versions poll the mode once a second while watching.
 */
class CallStateModule : Module() {
  private var audioManager: AudioManager? = null
  private var lastBusy: Boolean? = null
  private var modeListener: AudioManager.OnModeChangedListener? = null
  private val pollHandler = Handler(Looper.getMainLooper())
  private var polling = false

  private fun isBusy(mode: Int): Boolean =
    mode == AudioManager.MODE_RINGTONE ||
      mode == AudioManager.MODE_IN_CALL ||
      mode == AudioManager.MODE_IN_COMMUNICATION

  /** Emits only on a change, so JS never sees the same state twice in a row. */
  private fun report(mode: Int) {
    val busy = isBusy(mode)
    if (busy == lastBusy) return
    lastBusy = busy
    sendEvent("onCallStateChange", mapOf("busy" to busy))
  }

  private val poll = object : Runnable {
    override fun run() {
      audioManager?.let { report(it.mode) }
      if (polling) pollHandler.postDelayed(this, 1000)
    }
  }

  private fun start() {
    if (audioManager != null) return
    val context = appContext.reactContext ?: return
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    audioManager = manager
    lastBusy = null
    report(manager.mode)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val listener = AudioManager.OnModeChangedListener { mode -> report(mode) }
      manager.addOnModeChangedListener(ContextCompat.getMainExecutor(context), listener)
      modeListener = listener
    } else {
      polling = true
      pollHandler.postDelayed(poll, 1000)
    }
  }

  private fun stop() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      modeListener?.let { audioManager?.removeOnModeChangedListener(it) }
    }
    modeListener = null
    polling = false
    pollHandler.removeCallbacks(poll)
    audioManager = null
    lastBusy = null
  }

  override fun definition() = ModuleDefinition {
    Name("CallState")
    Events("onCallStateChange")
    Function("startWatching") { start() }
    Function("stopWatching") { stop() }
    OnDestroy { stop() }
  }
}
