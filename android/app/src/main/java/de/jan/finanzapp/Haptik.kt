package de.jan.finanzapp

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.View

/**
 * Haptik nach Bedeutung (Android-Richtlinie: Konstanten statt eigener Vibrationsmuster, sparsam einsetzen).
 * bestaetigt = etwas Wichtiges ist gespeichert · fehler = hat nicht geklappt · tick = Auswahl gewechselt · gegriffen = langes Drücken
 */
object Haptik {
    /** In der App: über die Ansicht, damit der System-Schalter „Vibration bei Berührung“ gilt. */
    fun anAnsicht(view: View, art: String) {
        val konst = when (art) {
            "bestaetigt" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
            "fehler" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
            "gegriffen" -> HapticFeedbackConstants.LONG_PRESS
            else -> HapticFeedbackConstants.CLOCK_TICK
        }
        view.performHapticFeedback(konst)
    }

    /** Im Widget (keine eigene Ansicht): vordefinierte Effekte über den Vibrator, nur wenn Berührungs-Vibration an ist. */
    fun ohneAnsicht(ctx: Context, art: String) {
        try {
            if (Settings.System.getInt(ctx.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 0) return
            val v: Vibrator = if (Build.VERSION.SDK_INT >= 31) {
                (ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION") ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            if (!v.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= 29) {
                val effekt = when (art) {
                    "bestaetigt" -> VibrationEffect.EFFECT_CLICK
                    "fehler" -> VibrationEffect.EFFECT_DOUBLE_CLICK
                    "gegriffen" -> VibrationEffect.EFFECT_HEAVY_CLICK
                    else -> VibrationEffect.EFFECT_TICK
                }
                v.vibrate(VibrationEffect.createPredefined(effekt))
            } else if (Build.VERSION.SDK_INT >= 26) {
                v.vibrate(VibrationEffect.createOneShot(if (art == "tick") 10L else 25L, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION") v.vibrate(if (art == "tick") 10L else 25L)
            }
        } catch (e: Exception) { /* ohne Vibration weiter */ }
    }
}
