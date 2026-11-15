package de.jan.finanzapp

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min

// Geld-Farbe (v23): Ausgaben rot wie in der App (--minus #EF9A8F). Färbt nur den Betrag im Text.
private const val ROT = 0xFFEF9A8F.toInt()
private fun rotBetrag(text: String, betrag: String): CharSequence {
    val i = text.indexOf(betrag)
    if (i < 0) return text
    val sp = SpannableString(text)
    sp.setSpan(ForegroundColorSpan(ROT), i, i + betrag.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    return sp
}

/** Zustand eines einzelnen Widgets (vorläufiger Betrag, letzte Buchung). Nicht Teil der gemeinsamen Daten. */
object WidgetZustand {
    private const val DATEI = "finanz_widget"
    private fun p(ctx: Context) = ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE)

    fun kategorie(ctx: Context, id: Int): String? = p(ctx).getString("kat_$id", null)
    fun setzeKategorie(ctx: Context, id: Int, kat: String) = p(ctx).edit().putString("kat_$id", kat).commit()
    fun vorlaeufig(ctx: Context, id: Int): Int = p(ctx).getInt("vorl_$id", 0)
    fun setzeVorlaeufig(ctx: Context, id: Int, w: Int) = p(ctx).edit().putInt("vorl_$id", w).commit()
    fun phase(ctx: Context, id: Int): String = p(ctx).getString("phase_$id", "") ?: ""
    fun setzePhase(ctx: Context, id: Int, w: String) = p(ctx).edit().putString("phase_$id", w).commit()
    fun letzte(ctx: Context, id: Int): String? = p(ctx).getString("letzte_$id", null)
    fun letzteZeit(ctx: Context, id: Int): Long = p(ctx).getLong("letzteZeit_$id", 0L)
    fun setzeLetzte(ctx: Context, id: Int, buchung: String?) {
        val e = p(ctx).edit()
        if (buchung == null) e.remove("letzte_$id").remove("letzteZeit_$id")
        else e.putString("letzte_$id", buchung).putLong("letzteZeit_$id", System.currentTimeMillis())
        e.commit()
    }
    fun loeschen(ctx: Context, ids: IntArray) {
        val e = p(ctx).edit()
        for (id in ids) for (k in listOf("kat_", "vorl_", "phase_", "letzte_", "letzteZeit_")) e.remove(k + id)
        e.commit()
    }
}

object Widgets {
    const val AKTION = "de.jan.finanzapp.WIDGET_AKTION"
    private const val ZULETZT_ZEIGEN_MS = 12L * 60 * 60 * 1000

    fun alleAktualisieren(ctx: Context) {
        val m = AppWidgetManager.getInstance(ctx)
        for (id in m.getAppWidgetIds(ComponentName(ctx, BudgetWidget::class.java))) budgetZeichnen(ctx, m, id)
        for (id in m.getAppWidgetIds(ComponentName(ctx, FixkostenWidget::class.java))) fixkostenZeichnen(ctx, m, id)
    }

    private fun appOeffnen(ctx: Context, nr: Int): PendingIntent {
        val i = Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(ctx, nr, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun einrichten(ctx: Context, widgetId: Int): PendingIntent {
        val i = Intent(ctx, BudgetWidgetEinrichtung::class.java)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .setData(Uri.parse("finanz://einrichten/$widgetId"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return PendingIntent.getActivity(ctx, 900000 + widgetId, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun aktion(ctx: Context, widgetId: Int, was: String, wert: String, nr: Int): PendingIntent {
        val i = Intent(ctx, BudgetWidget::class.java)
            .setAction(AKTION)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            .putExtra("was", was)
            .putExtra("wert", wert)
            .setData(Uri.parse("finanz://widget/$widgetId/$nr"))
        return PendingIntent.getBroadcast(ctx, widgetId * 100 + nr, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun symbol(name: String?): Int = when (name) {
        "wagen" -> R.drawable.ic_wagen
        "tanken" -> R.drawable.ic_tanken
        "freizeit" -> R.drawable.ic_freizeit
        else -> R.drawable.ic_sonstiges
    }

    // ---------- Budget-Widget ----------
    fun budgetZeichnen(ctx: Context, m: AppWidgetManager, id: Int) {
        val ansicht: RemoteViews = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            RemoteViews(mapOf(
                SizeF(100f, 100f) to budgetAnsicht(ctx, id, true),
                SizeF(240f, 230f) to budgetAnsicht(ctx, id, false)
            ))
        } else {
            val o: Bundle = m.getAppWidgetOptions(id)
            val breite = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
            val hoehe = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 250)
            budgetAnsicht(ctx, id, breite < 240 || hoehe < 230)
        }
        m.updateAppWidget(id, ansicht)
    }

    private fun budgetAnsicht(ctx: Context, id: Int, klein: Boolean): RemoteViews {
        val v = RemoteViews(ctx.packageName, if (klein) R.layout.widget_budget_klein else R.layout.widget_budget)
        val daten = Speicher.lesen(ctx)
        val katId = WidgetZustand.kategorie(ctx, id)
        val kat = if (daten != null) Logik.kategorie(daten, katId) else null
        val alleBereiche = intArrayOf(R.id.hinweis, R.id.schritte, R.id.aktion, R.id.gebucht, R.id.zuletzt)

        if (daten == null || kat == null) {
            v.setTextViewText(R.id.name, "Finanzen")
            v.setTextViewText(R.id.betrag, "–")
            v.setTextViewText(R.id.budget, "")
            v.setTextViewText(R.id.rest, "")
            v.setTextViewText(R.id.label, "")
            v.setViewVisibility(R.id.info, View.VISIBLE)
            v.setTextViewText(R.id.info, if (daten == null) "Bitte die App einmal öffnen." else "Antippen und Kategorie wählen.")
            for (b in alleBereiche) v.setViewVisibility(b, View.GONE)
            v.setImageViewBitmap(R.id.balken, balken(0.0, 0.0, 0.0))
            v.setOnClickPendingIntent(R.id.wurzel, if (daten == null) appOeffnen(ctx, 1) else einrichten(ctx, id))
            return v
        }

        val ym = Logik.monatText()
        val ausgegeben = Logik.ausgegebenIm(daten, ym, kat.getString("id"))
        val budget = kat.optDouble("budget", 0.0)
        val vorl = WidgetZustand.vorlaeufig(ctx, id)
        var phase = WidgetZustand.phase(ctx, id)
        val letzteId = WidgetZustand.letzte(ctx, id)
        val letzte = if (letzteId != null) Logik.buchungFinden(daten, letzteId) else null
        if (letzte == null && phase == "gebucht") phase = ""

        val emoji = kat.optString("emoji", "").takeIf { it.isNotBlank() && it != "null" }
        if (emoji != null) {
            v.setViewVisibility(R.id.symbol, View.GONE)
            v.setViewVisibility(R.id.symbolEmoji, View.VISIBLE)
            v.setTextViewText(R.id.symbolEmoji, emoji)
        } else {
            v.setViewVisibility(R.id.symbol, View.VISIBLE)
            v.setViewVisibility(R.id.symbolEmoji, View.GONE)
            v.setImageViewResource(R.id.symbol, symbol(kat.optString("symbol")))
        }
        v.setTextViewText(R.id.name, kat.optString("name"))
        v.setTextViewText(R.id.budget, if (budget > 0) "Budget " + Logik.euro(budget) else "ohne Budget")
        v.setTextViewText(R.id.label, "AUSGEGEBEN IM " + Logik.MONATE_LANG[Logik.monatsNummer(ym) - 1].uppercase() + "  ✎")
        v.setTextViewText(R.id.betrag, if (ausgegeben + vorl > 0) "− " + Logik.euro(ausgegeben + vorl) else Logik.euro(0.0))
        v.setTextColor(R.id.betrag, if (ausgegeben + vorl > 0) ROT else 0xFFEEF2F0.toInt())
        val rest = max(0.0, budget - ausgegeben - vorl)
        v.setTextViewText(R.id.rest, if (budget > 0) "noch " + Logik.euro(rest) else "")
        v.setImageViewBitmap(R.id.balken, balken(budget, ausgegeben, vorl.toDouble()))
        v.setOnClickPendingIntent(R.id.kopf, appOeffnen(ctx, 2))
        // Betrag antippen: genauen Betrag in der App eintippen (Kategorie ist schon gewählt)
        v.setOnClickPendingIntent(R.id.betragbereich, PendingIntent.getActivity(ctx, 700000 + id, Kurzbefehle.eintragenIntent(ctx, kat.getString("id")), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))

        // Knöpfe +5 / +10 / −5 (klein: höchstens 2)
        val alle = mutableListOf<Int>()
        val arr = kat.optJSONArray("schritte")
        if (arr != null) for (i in 0 until arr.length()) alle.add(arr.optInt(i))
        if (alle.isEmpty()) alle.addAll(listOf(5, 10))
        val schritte = if (klein) (alle.filter { it > 0 }.take(2).ifEmpty { alle.take(2) }) else alle.take(3)
        val knopfIds = intArrayOf(R.id.s1, R.id.s2, R.id.s3)
        for ((i, kid) in knopfIds.withIndex()) {
            if (i < schritte.size) {
                val w = schritte[i]
                v.setViewVisibility(kid, View.VISIBLE)
                v.setTextViewText(kid, (if (w > 0) "+ " else "− ") + kotlin.math.abs(w))
                v.setContentDescription(kid, (if (w > 0) "${w} Euro mehr" else "${-w} Euro weniger"))
                v.setOnClickPendingIntent(kid, aktion(ctx, id, "schritt", w.toString(), 10 + i))
            } else v.setViewVisibility(kid, View.GONE)
        }
        v.setViewVisibility(R.id.schritte, if (phase == "gebucht" && klein) View.GONE else View.VISIBLE)

        // vorläufiger Betrag: alter Stand bleibt sichtbar
        val hatVorl = vorl > 0
        v.setViewVisibility(R.id.aktion, if (hatVorl) View.VISIBLE else View.GONE)
        val vorherText = "vorher " + Logik.euro(ausgegeben) + " · dazu " + Logik.euro(vorl.toDouble())
        if (klein) {
            v.setViewVisibility(R.id.hinweis, View.GONE)
            v.setViewVisibility(R.id.info, View.VISIBLE)
            v.setTextViewText(R.id.info, when {
                hatVorl -> vorherText
                phase == "gebucht" && letzte != null -> Logik.euro(letzte.optDouble("betrag")).let { b -> rotBetrag("− $b gebucht. " + kat.optString("frage", "Wo?"), "− $b") }
                letzte != null && System.currentTimeMillis() - WidgetZustand.letzteZeit(ctx, id) < ZULETZT_ZEIGEN_MS -> Logik.euro(letzte.optDouble("betrag")).let { b -> rotBetrag("Zuletzt: − $b · " + (letzte.optString("ort").takeIf { it.isNotEmpty() && it != "null" } ?: "ohne Ort"), "− $b") }
                budget > 0 -> "noch " + Logik.euro(rest) + " von " + Logik.euro(budget)
                else -> "ohne Budget"
            })
        } else {
            v.setViewVisibility(R.id.hinweis, if (hatVorl) View.VISIBLE else View.GONE)
            v.setTextViewText(R.id.hinweis, "$vorherText · noch nicht gebucht")
        }
        v.setOnClickPendingIntent(R.id.abbrechen, aktion(ctx, id, "abbrechen", "", 20))
        v.setTextViewText(R.id.buchen, Logik.euro(vorl.toDouble()) + " buchen")
        v.setOnClickPendingIntent(R.id.buchen, aktion(ctx, id, "buchen", "", 21))

        // nach dem Buchen: Ort/Kategorie antippen oder Rückgängig
        val zeigeGebucht = phase == "gebucht" && letzte != null && !hatVorl
        v.setViewVisibility(R.id.gebucht, if (zeigeGebucht) View.VISIBLE else View.GONE)
        if (zeigeGebucht && letzte != null) {
            v.setTextViewText(R.id.gebuchtText, if (klein) "" else Logik.euro(letzte.optDouble("betrag")).let { b -> rotBetrag("− $b gebucht. " + kat.optString("frage", "Wo?") + " (optional)", "− $b") })
            v.setViewVisibility(R.id.gebuchtText, if (klein) View.GONE else View.VISIBLE)
            v.setOnClickPendingIntent(R.id.rueck1, aktion(ctx, id, "rueckgaengig", "", 30))
            val chips = mutableListOf<String>()
            val ca = kat.optJSONArray("chips")
            if (ca != null) for (i in 0 until ca.length()) chips.add(ca.optString(i))
            val platz = if (klein) 3 else 4
            val chipIds = intArrayOf(R.id.c1, R.id.c2, R.id.c3, R.id.c4, R.id.c5)
            val belegt = chips.take(platz)
            for ((i, cid) in chipIds.withIndex()) {
                when {
                    i < belegt.size -> {
                        v.setViewVisibility(cid, View.VISIBLE); v.setTextViewText(cid, belegt[i])
                        v.setOnClickPendingIntent(cid, aktion(ctx, id, "chip", belegt[i], 40 + i))
                    }
                    i == belegt.size -> {
                        v.setViewVisibility(cid, View.VISIBLE); v.setTextViewText(cid, "Überspringen")
                        v.setOnClickPendingIntent(cid, aktion(ctx, id, "ueberspringen", "", 49))
                    }
                    klein && i == 4 -> v.setViewVisibility(cid, View.GONE)
                    else -> v.setViewVisibility(cid, View.INVISIBLE)
                }
            }
        }

        // danach: „Zuletzt …“ mit Rückgängig (bis zu 12 Stunden)
        val zeigeZuletzt = !zeigeGebucht && !hatVorl && letzte != null && !klein &&
            System.currentTimeMillis() - WidgetZustand.letzteZeit(ctx, id) < ZULETZT_ZEIGEN_MS
        v.setViewVisibility(R.id.zuletzt, if (zeigeZuletzt) View.VISIBLE else View.GONE)
        if (zeigeZuletzt && letzte != null) {
            val ort = letzte.optString("ort").takeIf { it.isNotEmpty() && it != "null" } ?: "ohne Ort"
            v.setTextViewText(R.id.zuletztText, Logik.euro(letzte.optDouble("betrag")).let { b -> rotBetrag("Zuletzt: − $b · $ort", "− $b") })
            v.setOnClickPendingIntent(R.id.rueck2, aktion(ctx, id, "rueckgaengig", "", 31))
        }
        return v
    }

    /** Balken als Bild: ausgegeben (Akzent) + vorläufig (gestreift). */
    fun balken(budget: Double, ausgegeben: Double, vorl: Double): Bitmap {
        val b = 600; val h = 16
        val bmp = Bitmap.createBitmap(b, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val form = Path().apply { addRoundRect(RectF(0f, 0f, b.toFloat(), h.toFloat()), h / 2f, h / 2f, Path.Direction.CW) }
        c.clipPath(form)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = 0x1AFFFFFF
        c.drawRect(0f, 0f, b.toFloat(), h.toFloat(), p)
        val basis = if (budget > 0) budget else max(1.0, ausgegeben + vorl)
        val wA = (min(1.0, ausgegeben / basis) * b).toFloat()
        val wV = (min(1.0 - wA / b, vorl / basis) * b).toFloat().coerceAtLeast(0f)
        p.color = 0xFF7FD6C8.toInt()
        c.drawRect(0f, 0f, wA, h.toFloat(), p)
        if (wV > 0) {
            p.color = 0x73C9D27A
            c.drawRect(wA, 0f, wA + wV, h.toFloat(), p)
            c.save()
            c.clipRect(wA, 0f, wA + wV, h.toFloat())
            p.color = 0xFFC9D27A.toInt()
            p.strokeWidth = 5f
            var x = wA - h
            while (x < wA + wV + h) { c.drawLine(x, h.toFloat(), x + h, 0f, p); x += 10f }
            c.restore()
        }
        return bmp
    }

    fun behandle(ctx: Context, intent: Intent) {
        val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return
        val wert = intent.getStringExtra("wert") ?: ""
        when (intent.getStringExtra("was")) {
            "schritt" -> {
                Haptik.ohneAnsicht(ctx, "tick")
                val neu = max(0, WidgetZustand.vorlaeufig(ctx, id) + (wert.toIntOrNull() ?: 0))
                WidgetZustand.setzeVorlaeufig(ctx, id, neu)
                if (WidgetZustand.phase(ctx, id) == "gebucht") WidgetZustand.setzePhase(ctx, id, "")
            }
            "abbrechen" -> WidgetZustand.setzeVorlaeufig(ctx, id, 0)
            "buchen" -> {
                val betrag = WidgetZustand.vorlaeufig(ctx, id)
                val kat = WidgetZustand.kategorie(ctx, id)
                if (betrag > 0 && kat != null) {
                    val buchungId = "b-" + java.lang.Long.toString(System.currentTimeMillis(), 36) + "-" + (1000..9999).random()
                    val ok = Speicher.aendern(ctx) { d ->
                        val liste = d.optJSONArray("buchungen") ?: org.json.JSONArray().also { d.put("buchungen", it) }
                        liste.put(JSONObject().put("id", buchungId).put("zeit", Logik.jetztText()).put("kategorieId", kat)
                            .put("betrag", betrag).put("ort", JSONObject.NULL).put("quelle", "widget"))
                    }
                    if (ok != null) {
                        Haptik.ohneAnsicht(ctx, "bestaetigt")
                        WidgetZustand.setzeVorlaeufig(ctx, id, 0)
                        WidgetZustand.setzeLetzte(ctx, id, buchungId)
                        WidgetZustand.setzePhase(ctx, id, "gebucht")
                    }
                }
            }
            "chip" -> {
                Haptik.ohneAnsicht(ctx, "tick")
                val bId = WidgetZustand.letzte(ctx, id)
                if (bId != null) Speicher.aendern(ctx) { d -> Logik.buchungFinden(d, bId)?.put("ort", wert) }
                WidgetZustand.setzePhase(ctx, id, "")
            }
            "ueberspringen" -> WidgetZustand.setzePhase(ctx, id, "")
            "rueckgaengig" -> {
                Haptik.ohneAnsicht(ctx, "tick")
                val bId = WidgetZustand.letzte(ctx, id)
                if (bId != null) Speicher.aendern(ctx) { d -> Logik.buchungEntfernen(d, bId) }
                WidgetZustand.setzeLetzte(ctx, id, null)
                WidgetZustand.setzePhase(ctx, id, "")
            }
        }
        alleAktualisieren(ctx)
    }

    // ---------- Fixkosten-Widget ----------
    fun fixkostenZeichnen(ctx: Context, m: AppWidgetManager, id: Int) {
        val v = RemoteViews(ctx.packageName, R.layout.widget_fixkosten)
        v.setOnClickPendingIntent(R.id.wurzel, appOeffnen(ctx, 5))
        val daten = Speicher.lesen(ctx)
        val liste = if (daten != null) Logik.naechsteAbbuchungen(daten) else emptyList()
        if (daten == null || liste.isEmpty()) {
            v.setTextViewText(R.id.summe, "")
            v.setTextViewText(R.id.naechsteName, if (daten == null) "Bitte die App einmal öffnen." else "Noch keine Fixkosten eingetragen.")
            v.setTextViewText(R.id.naechsteWann, "")
            v.setViewVisibility(R.id.zeile2, View.GONE)
            m.updateAppWidget(id, v)
            return
        }
        v.setTextViewText(R.id.summe, Logik.euro(Math.rint(Logik.fixkostenProMonat(daten))).let { b -> rotBetrag("≈ − $b im Monat", "− $b") })
        val erstesDatum = liste[0].datum
        val gruppe = liste.filter { it.datum == erstesDatum }
        val namen = gruppe.take(2).joinToString(", ") { it.name } + if (gruppe.size > 2) " …" else ""
        v.setTextViewText(R.id.naechsteName, "Nächste: $namen")
        v.setTextViewText(R.id.naechsteWann, Logik.euro(gruppe.sumOf { it.betrag }).let { b -> rotBetrag(Logik.datumKurz(erstesDatum) + " · − " + b, "− $b") })
        val brocken = liste.firstOrNull { !it.monatlich && it.datum > erstesDatum }
        if (brocken != null) {
            v.setViewVisibility(R.id.zeile2, View.VISIBLE)
            v.setTextViewText(R.id.brockenName, "Großer Brocken: " + brocken.name)
            v.setTextViewText(R.id.brockenWann, Logik.euro(brocken.betrag).let { b -> rotBetrag(Logik.datumKurz(brocken.datum) + " · − " + b, "− $b") })
        } else v.setViewVisibility(R.id.zeile2, View.GONE)
        m.updateAppWidget(id, v)
    }
}

class BudgetWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, m: AppWidgetManager, ids: IntArray) {
        for (id in ids) Widgets.budgetZeichnen(ctx, m, id)
    }
    override fun onAppWidgetOptionsChanged(ctx: Context, m: AppWidgetManager, id: Int, neu: Bundle) {
        Widgets.budgetZeichnen(ctx, m, id)
    }
    override fun onDeleted(ctx: Context, ids: IntArray) = WidgetZustand.loeschen(ctx, ids)
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action == Widgets.AKTION) { Widgets.behandle(ctx, intent); return }
        super.onReceive(ctx, intent)
    }
}

class FixkostenWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, m: AppWidgetManager, ids: IntArray) {
        for (id in ids) Widgets.fixkostenZeichnen(ctx, m, id)
    }
}
