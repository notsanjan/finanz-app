package de.jan.finanzapp

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import kotlin.math.abs
import kotlin.math.min
import kotlin.math.roundToLong

/**
 * Gemeinsamer Speicher von App und Widgets: ein JSON-Text in SharedPreferences.
 * Format wie www/js/daten.js (Konzept §5/§15). Die Rechenregeln hier müssen
 * zu www/js/rechnen.js passen.
 */
object Speicher {
    private const val DATEI = "finanz"
    private const val SCHLUESSEL = "daten"
    private val sperre = Any()

    fun lesenText(context: Context): String? =
        context.getSharedPreferences(DATEI, Context.MODE_PRIVATE).getString(SCHLUESSEL, null)

    fun schreibenText(context: Context, text: String) {
        synchronized(sperre) {
            context.getSharedPreferences(DATEI, Context.MODE_PRIVATE).edit().putString(SCHLUESSEL, text).commit()
        }
    }

    fun lesen(context: Context): JSONObject? {
        val t = lesenText(context) ?: return null
        return try { JSONObject(t) } catch (e: Exception) { null }
    }

    /** Liest, ändert und schreibt in einem Schritt. */
    fun aendern(context: Context, aenderung: (JSONObject) -> Unit): JSONObject? {
        synchronized(sperre) {
            val d = lesen(context) ?: return null
            aenderung(d)
            schreibenText(context, d.toString())
            return d
        }
    }
}

object Logik {
    val MONATE_KURZ = arrayOf("Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez")
    val MONATE_LANG = arrayOf("Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember")
    private val RHYTHMUS = mapOf("monatlich" to 1, "vierteljaehrlich" to 3, "halbjaehrlich" to 6, "jaehrlich" to 12)

    fun jetztText(): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.GERMANY).format(Date())
    fun heuteText(): String = jetztText().substring(0, 10)
    fun monatText(): String = jetztText().substring(0, 7)
    fun monatsNummer(ym: String): Int = ym.substring(5, 7).toInt()

    fun ymPlus(ym: String, n: Int): String {
        val j = ym.substring(0, 4).toInt()
        val m = ym.substring(5, 7).toInt()
        val t = j * 12 + (m - 1) + n
        return String.format(Locale.ROOT, "%04d-%02d", t / 12, t % 12 + 1)
    }

    fun tageImMonat(ym: String): Int {
        val c = Calendar.getInstance()
        c.clear()
        c.set(ym.substring(0, 4).toInt(), ym.substring(5, 7).toInt() - 1, 1)
        return c.getActualMaximum(Calendar.DAY_OF_MONTH)
    }

    fun euro(x: Double): String {
        val r = (x * 100).roundToLong() / 100.0
        val ganz = abs(r - Math.rint(r)) < 0.001
        val nf = java.text.NumberFormat.getNumberInstance(Locale.GERMANY)
        nf.minimumFractionDigits = if (ganz) 0 else 2
        nf.maximumFractionDigits = if (ganz) 0 else 2
        return nf.format(r) + " €"
    }

    fun kategorie(d: JSONObject, id: String?): JSONObject? {
        if (id == null) return null
        val k = d.optJSONArray("kategorien") ?: return null
        for (i in 0 until k.length()) { val o = k.getJSONObject(i); if (o.optString("id") == id) return o }
        return null
    }

    fun budgetKategorien(d: JSONObject): List<JSONObject> {
        val k = d.optJSONArray("kategorien") ?: return emptyList()
        return (0 until k.length()).map { k.getJSONObject(it) }.filter { it.optString("art") == "budget" }
    }

    // v43: Monat von Gehalt zu Gehalt (wie rechnen.js monatsBeginn/periode). 0 = Kalendermonat.
    fun beginnTag(d: JSONObject): Int {
        val e = d.optJSONObject("einstellungen") ?: return 0
        if (!e.optBoolean("gehaltsmonat", false)) return 0
        val l = d.optJSONArray("einnahmen") ?: return 0
        var g: JSONObject? = null
        for (i in 0 until l.length()) { val o = l.getJSONObject(i); if (o.optString("id") == "gehalt") { g = o; break } }
        if (g == null) for (i in 0 until l.length()) { val o = l.getJSONObject(i); if (o.optString("wieOft") == "monatlich" && (o.isNull("status") || o.optString("status").isEmpty())) { g = o; break } }
        if (g == null || g.optString("kommtAn") != "Tag") return 0
        val t = g.optString("ankunftTag", "").toIntOrNull() ?: 0
        return if (t > 1) t else 0
    }

    fun periode(d: JSONObject, datum: String): String {
        if (datum.length < 10) return datum.take(7)
        val c = datum.substring(0, 7)
        val b = beginnTag(d)
        if (b == 0) return c
        return if (datum.substring(8, 10).toInt() >= minOf(b, tageImMonat(c))) ymPlus(c, 1) else c
    }

    fun aktuellePeriode(d: JSONObject): String = periode(d, heuteText())

    fun ausgegebenIm(d: JSONObject, ym: String, katId: String): Double {
        val b = d.optJSONArray("buchungen") ?: return 0.0
        var s = 0.0
        for (i in 0 until b.length()) {
            val o = b.getJSONObject(i)
            if (o.optString("kategorieId") == katId && periode(d, o.optString("zeit")) == ym) s += o.optDouble("betrag", 0.0)
        }
        return s
    }

    fun buchungFinden(d: JSONObject, id: String): JSONObject? {
        val b = d.optJSONArray("buchungen") ?: return null
        for (i in 0 until b.length()) { val o = b.getJSONObject(i); if (o.optString("id") == id) return o }
        return null
    }

    fun buchungEntfernen(d: JSONObject, id: String): Boolean {
        val b = d.optJSONArray("buchungen") ?: return false
        val neu = JSONArray()
        var weg = false
        for (i in 0 until b.length()) { val o = b.getJSONObject(i); if (o.optString("id") == id) weg = true else neu.put(o) }
        d.put("buchungen", neu)
        return weg
    }

    // ----- Fixkosten (wie rechnen.js) -----
    private fun schritt(f: JSONObject): Int = RHYTHMUS[f.optString("wieOft")] ?: 1

    // v27: Mit Monat gilt der Betrag, der in diesem Monat galt (`frueher: [{ bis, betrag, meinAnteil? }]`, wie rechnen.js)
    fun eigenerBetrag(f: JSONObject, ym: String? = null): Double {
        var anteil = if (f.isNull("meinAnteil")) 100.0 else f.optDouble("meinAnteil", 100.0)
        var betrag = f.optDouble("betrag", 0.0)
        val frueher = f.optJSONArray("frueher")
        if (ym != null && frueher != null) {
            var bestes = ""
            for (i in 0 until frueher.length()) {
                val o = frueher.optJSONObject(i) ?: continue
                val bis = o.optString("bis", "")
                if (bis.length == 7 && ym <= bis && (bestes.isEmpty() || bis < bestes)) {
                    bestes = bis
                    betrag = o.optDouble("betrag", betrag)
                    if (!o.isNull("meinAnteil")) anteil = o.optDouble("meinAnteil", anteil)
                }
            }
        }
        return betrag * anteil / 100.0
    }

    fun abbuchungsMonate(f: JSONObject): List<Int> {
        val s = schritt(f)
        if (s == 1) return (1..12).toList()
        val start = if (f.isNull("monat")) 1 else f.optInt("monat", 1)
        return (0 until 12 step s).map { ((start - 1 + it) % 12) + 1 }.sorted()
    }

    fun laeuftIm(f: JSONObject, ym: String): Boolean {
        val ende = if (f.isNull("endetAm")) "" else f.optString("endetAm", "")
        return ende.length < 7 || ym <= ende.substring(0, 7)
    }

    fun wirdAbgebuchtIm(f: JSONObject, ym: String) = laeuftIm(f, ym) && abbuchungsMonate(f).contains(monatsNummer(ym))

    fun abbuchungsTag(f: JSONObject, ym: String) = min(f.optInt("tag", 1).coerceAtLeast(1), tageImMonat(ym))

    // v33: SEPA-Lastschriften nur an TARGET-Geschäftstagen (gleiche Regel wie rechnen.js → bankTag)
    private fun ostersonntag(j: Int): Calendar {
        val a = j % 19; val b = j / 100; val c = j % 100; val d = b / 4; val e = b % 4; val f = (b + 8) / 25; val g = (b - f + 1) / 3
        val h = (19 * a + b - d - g + 15) % 30; val i = c / 4; val k = c % 4; val l = (32 + 2 * e + 2 * i - h - k) % 7; val m = (a + 11 * h + 22 * l) / 451
        val monat = (h + l - 7 * m + 114) / 31; val tag = ((h + l - 7 * m + 114) % 31) + 1
        val cal = Calendar.getInstance(); cal.clear(); cal.set(j, monat - 1, tag, 12, 0); return cal
    }
    private fun isoTag(c: Calendar) = String.format(Locale.ROOT, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    private fun targetFrei(j: Int): Set<String> {
        val o = ostersonntag(j)
        val kf = o.clone() as Calendar; kf.add(Calendar.DAY_OF_MONTH, -2)
        val om = o.clone() as Calendar; om.add(Calendar.DAY_OF_MONTH, 1)
        return setOf("$j-01-01", isoTag(kf), isoTag(om), "$j-05-01", "$j-12-25", "$j-12-26")
    }
    fun bankTag(datum: String): String {
        val c = Calendar.getInstance(); c.clear()
        c.set(datum.substring(0, 4).toInt(), datum.substring(5, 7).toInt() - 1, datum.substring(8, 10).toInt(), 12, 0)
        for (n in 0 until 10) {
            val w = c.get(Calendar.DAY_OF_WEEK)
            if (w != Calendar.SATURDAY && w != Calendar.SUNDAY && !targetFrei(c.get(Calendar.YEAR)).contains(isoTag(c))) break
            c.add(Calendar.DAY_OF_MONTH, 1)
        }
        return isoTag(c)
    }

    fun fixkostenListe(d: JSONObject): List<JSONObject> {
        val a = d.optJSONArray("fixkosten") ?: return emptyList()
        return (0 until a.length()).map { a.getJSONObject(it) }
    }

    fun fixkostenProMonat(d: JSONObject): Double {
        val ym = monatText()
        return fixkostenListe(d).filter { laeuftIm(it, ym) }.sumOf { eigenerBetrag(it, ym) / schritt(it) }
    }

    data class Abbuchung(val datum: String, val name: String, val betrag: Double, val monatlich: Boolean)

    fun naechsteAbbuchungen(d: JSONObject): List<Abbuchung> {
        val heute = heuteText()
        var ym = ymPlus(monatText(), -1)
        val liste = mutableListOf<Abbuchung>()
        val alle = fixkostenListe(d)
        for (i in 0 until 14) {
            for (f in alle) {
                if (!wirdAbgebuchtIm(f, ym)) continue
                val datum = bankTag(ym + "-" + String.format(Locale.ROOT, "%02d", abbuchungsTag(f, ym)))
                if (datum >= heute) liste.add(Abbuchung(datum, f.optString("name"), eigenerBetrag(f, ym), schritt(f) == 1))
            }
            ym = ymPlus(ym, 1)
        }
        return liste.sortedBy { it.datum }
    }

    fun datumKurz(datum: String): String = datum.substring(8, 10).toInt().toString() + ". " + MONATE_KURZ[datum.substring(5, 7).toInt() - 1]
}
