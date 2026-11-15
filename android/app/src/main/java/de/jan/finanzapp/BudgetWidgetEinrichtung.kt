package de.jan.finanzapp

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.res.ResourcesCompat

/** Wird beim Platzieren eines Budget-Widgets geöffnet: Welche Kategorie soll es zeigen? */
class BudgetWidgetEinrichtung : Activity() {
    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setResult(RESULT_CANCELED)
        widgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }
        aufbauen()
    }

    private fun dp(x: Int) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, x.toFloat(), resources.displayMetrics).toInt()
    private fun schrift(id: Int) = try { ResourcesCompat.getFont(this, id) } catch (e: Exception) { null }

    private fun knopfHg(farbe: Int, rand: Int): GradientDrawable = GradientDrawable().apply {
        cornerRadius = dp(24).toFloat(); setColor(farbe); setStroke(dp(1), rand)
    }

    private fun aufbauen() {
        val liste = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(48), dp(20), dp(24))
        }
        val titel = TextView(this).apply {
            text = "Welche Kategorie soll das Widget zeigen?"
            setTextColor(Color.parseColor("#EEF2F0")); textSize = 24f
            typeface = schrift(R.font.barlow_light)
        }
        liste.addView(titel)
        val daten = Speicher.lesen(this)
        val kats = if (daten != null) Logik.budgetKategorien(daten) else emptyList()
        val hinweis = TextView(this).apply {
            text = if (daten == null) "Bitte zuerst die App einmal öffnen und einrichten." else
                "Plus und Minus gibt es nur hier im Widget. Budget und Knöpfe stellst du in der App ein."
            setTextColor(Color.parseColor("#B7C1BE")); textSize = 15f
            typeface = schrift(R.font.barlow_regular)
            setPadding(0, dp(8), 0, dp(16))
        }
        liste.addView(hinweis)
        val aktuell = WidgetZustand.kategorie(this, widgetId)
        for (k in kats) {
            val id = k.optString("id")
            val b = Button(this).apply {
                text = k.optString("name") + if (k.optDouble("budget", 0.0) > 0) "  ·  Budget " + Logik.euro(k.optDouble("budget")) else ""
                isAllCaps = false
                textSize = 17f
                typeface = schrift(R.font.barlow_medium)
                setTextColor(Color.parseColor("#EEF2F0"))
                gravity = Gravity.CENTER_VERTICAL or Gravity.START
                setPadding(dp(18), 0, dp(18), 0)
                background = knopfHg(if (id == aktuell) Color.parseColor("#2E7FD6C8") else Color.parseColor("#1D2327"),
                    if (id == aktuell) Color.parseColor("#7FD6C8") else Color.parseColor("#24FFFFFF"))
                backgroundTintList = null as ColorStateList?
                stateListAnimator = null
                setOnClickListener { waehlen(id) }
            }
            liste.addView(b, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)).apply { bottomMargin = dp(10) })
        }
        if (daten == null) {
            val oeffnen = Button(this).apply {
                text = "App öffnen"; isAllCaps = false; textSize = 16f
                setTextColor(Color.WHITE); background = knopfHg(Color.parseColor("#3A6B5C"), Color.parseColor("#3A6B5C"))
                stateListAnimator = null
                setOnClickListener { startActivity(Intent(this@BudgetWidgetEinrichtung, MainActivity::class.java)); finish() }
            }
            liste.addView(oeffnen, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52)))
        }
        val scroll = ScrollView(this).apply { setBackgroundColor(Color.parseColor("#14181B")); addView(liste) }
        setContentView(scroll)
    }

    private fun waehlen(katId: String) {
        WidgetZustand.setzeKategorie(this, widgetId, katId)
        WidgetZustand.setzeVorlaeufig(this, widgetId, 0)
        WidgetZustand.setzePhase(this, widgetId, "")
        WidgetZustand.setzeLetzte(this, widgetId, null)
        Widgets.budgetZeichnen(this, AppWidgetManager.getInstance(this), widgetId)
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
        finish()
    }
}
