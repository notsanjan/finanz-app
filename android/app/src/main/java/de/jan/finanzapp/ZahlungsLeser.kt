package de.jan.finanzapp

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject

/**
 * BETA: Zahlungen aus Benachrichtigungen erkennen (PayPal, Google Wallet, Banking-Apps).
 * Bucht nie selbst: legt nur Vorschläge ab, die der Nutzer in der App bestätigt.
 * Alles bleibt auf dem Gerät.
 */
object Erkennung {
    private const val DATEI = "finanz_erkennung"
    private const val KANAL = "erkannt"

    /** Bekannte Zahlungs-Apps (Paketname → Anzeigename). Weitere Apps lernt die App, sobald sie einen Betrag senden. */
    val BEKANNT = mapOf(
        "com.paypal.android.p2pmobile" to "PayPal",
        "com.google.android.apps.walletnfcrel" to "Google Wallet",
        "de.fiduciagad.android.vrbanking" to "VR Banking",
        "de.fiducia.smartphone.android.banking.vr" to "VR Banking",
        "com.starfinanz.smob.android.sfinanzstatus" to "Sparkasse",
        "de.dkb.portalapp" to "DKB",
        "de.ingdiba.bankingapp" to "ING",
        "de.number26.android" to "N26",
        "com.comdirect.app" to "comdirect",
        "de.commerzbanking.mobil" to "Commerzbank",
        "de.postbank.finanzassistent" to "Postbank",
        "com.revolut.revolut" to "Revolut",
        "de.traderepublic.app" to "Trade Republic",
        "com.c24.bank" to "C24",
        "com.db.pwcc.dbmobile" to "Deutsche Bank"
    )

    private fun p(ctx: Context) = ctx.getSharedPreferences(DATEI, Context.MODE_PRIVATE)

    fun eingeschaltet(ctx: Context) = p(ctx).getBoolean("an", false)
    fun setzeEin(ctx: Context, an: Boolean) = p(ctx).edit().putBoolean("an", an).commit()

    fun erlaubt(ctx: Context): Boolean {
        val liste = Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners") ?: return false
        val ich = ComponentName(ctx, ZahlungsLeser::class.java).flattenToString()
        return liste.split(":").any { it == ich }
    }

    /** Apps, die schon Beträge gesendet haben (gelernt) + bekannte; mit Schalter. */
    fun apps(ctx: Context): JSONArray {
        val gelernt = JSONObject(p(ctx).getString("apps", "{}") ?: "{}")
        val r = JSONArray()
        val alle = LinkedHashMap<String, String>()
        for (k in gelernt.keys()) alle[k] = gelernt.optString(k)
        for ((k, v) in BEKANNT) if (!alle.containsKey(k) && installiert(ctx, k)) alle[k] = v
        for ((paket, name) in alle) r.put(JSONObject().put("paket", paket).put("name", name).put("an", appAn(ctx, paket)).put("bekannt", BEKANNT.containsKey(paket)).put("gesehen", gelernt.has(paket)))
        return r
    }

    /** Bekannte Zahlungs-Apps sind an, bis der Nutzer sie ausschaltet; andere Apps aus, bis er sie einschaltet. */
    fun appAn(ctx: Context, paket: String): Boolean =
        if (BEKANNT.containsKey(paket)) !JSONObject(p(ctx).getString("aus", "{}") ?: "{}").optBoolean(paket, false)
        else p(ctx).getBoolean("frei_$paket", false)

    fun setzeApp(ctx: Context, paket: String, an: Boolean) {
        if (!BEKANNT.containsKey(paket)) { p(ctx).edit().putBoolean("frei_$paket", an).commit(); return }
        val aus = JSONObject(p(ctx).getString("aus", "{}") ?: "{}")
        if (an) aus.remove(paket) else aus.put(paket, true)
        p(ctx).edit().putString("aus", aus.toString()).commit()
    }

    private fun installiert(ctx: Context, paket: String): Boolean = try {
        ctx.packageManager.getApplicationInfo(paket, 0); true
    } catch (e: Exception) { false }

    private fun appName(ctx: Context, paket: String): String = BEKANNT[paket] ?: try {
        ctx.packageManager.getApplicationLabel(ctx.packageManager.getApplicationInfo(paket, 0)).toString()
    } catch (e: Exception) { paket }

    fun vorschlaege(ctx: Context): JSONArray = JSONArray(p(ctx).getString("liste", "[]") ?: "[]")

    fun entfernen(ctx: Context, ids: Set<String>) {
        synchronized(this) {
            val alt = vorschlaege(ctx); val neu = JSONArray()
            for (i in 0 until alt.length()) { val o = alt.getJSONObject(i); if (!ids.contains(o.optString("id"))) neu.put(o) }
            p(ctx).edit().putString("liste", neu.toString()).commit()
        }
    }

    // ---------- Text erkennen ----------
    private val BETRAG = listOf(
        Regex("""(?:€|EUR)\s?(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2})"""),
        Regex("""(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+\.\d{2})\s?(?:€|EUR)""")
    )
    private val EINGANG = Regex("""(?i)(erhalten|gutschrift|eingegangen|eingang|zahlungseingang|rückerstattung|erstattet|hat dir .* gesendet|received|refund)""")
    private val HAENDLER = listOf(
        Regex("""(?i)\bbei\s+([^\n,.!]{2,40}?)(?:\s+(?:bezahlt|gezahlt|mit|über|am)\b|[,.!]|$)"""),
        Regex("""(?i)\ban\s+([^\n,.!]{2,40}?)(?:\s+(?:gesendet|gezahlt|bezahlt|überwiesen)\b|[,.!]|$)"""),
        Regex("""(?i)\bat\s+([^\n,.!]{2,40}?)(?:[,.!]|$)""")
    )

    fun betragAus(text: String): Double? {
        for (r in BETRAG) {
            val m = r.find(text) ?: continue
            var s = m.groupValues[1]
            s = if (s.contains(',')) s.replace(".", "").replace(',', '.') else s
            val v = s.toDoubleOrNull() ?: continue
            if (kotlin.math.abs(v) >= 0.01 && kotlin.math.abs(v) < 100000) return kotlin.math.abs(v)
        }
        return null
    }

    fun haendlerAus(titel: String, text: String, paket: String): String {
        for (r in HAENDLER) {
            val m = r.find(text) ?: continue
            val h = m.groupValues[1].trim()
            if (h.isNotEmpty() && betragAus(h) == null) return h.take(40)
        }
        // Google Wallet: Titel ist meist der Händler
        if (titel.isNotBlank() && betragAus(titel) == null && titel != BEKANNT[paket]) return titel.take(40)
        return ""
    }

    fun verarbeite(ctx: Context, paket: String, titel: String, text: String, zeit: Long) {
        if (!eingeschaltet(ctx) || paket == ctx.packageName) return
        val ganz = "$titel\n$text"
        val betrag = betragAus(ganz) ?: return
        // App lernen (auch wenn sie aus ist), damit sie in den Einstellungen erscheint
        val gelernt = JSONObject(p(ctx).getString("apps", "{}") ?: "{}")
        if (!gelernt.has(paket)) { gelernt.put(paket, appName(ctx, paket)); p(ctx).edit().putString("apps", gelernt.toString()).commit() }
        // Unbekannte Apps sind aus, bis der Nutzer sie einschaltet (sonst würden Chat-Nachrichten mit € erkannt)
        if (!appAn(ctx, paket)) return
        if (EINGANG.containsMatchIn(ganz)) return
        synchronized(this) {
            val liste = vorschlaege(ctx)
            // doppelte Benachrichtigung (gleiche App, gleicher Betrag, < 3 Minuten) überspringen
            for (i in 0 until liste.length()) {
                val o = liste.getJSONObject(i)
                if (o.optString("app") == paket && kotlin.math.abs(o.optDouble("betrag") - betrag) < 0.005 && kotlin.math.abs(o.optLong("ms") - zeit) < 180000) return
            }
            val v = JSONObject()
                .put("id", "e" + zeit.toString(36))
                .put("ms", zeit)
                .put("zeit", java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.GERMANY).format(java.util.Date(zeit)))
                .put("betrag", betrag)
                .put("haendler", haendlerAus(titel, text, paket))
                .put("app", paket)
                .put("appName", appName(ctx, paket))
                .put("text", ganz.take(200))
            liste.put(v)
            // höchstens 50 offene Vorschläge
            val neu = JSONArray(); val start = maxOf(0, liste.length() - 50)
            for (i in start until liste.length()) neu.put(liste.get(i))
            p(ctx).edit().putString("liste", neu.toString()).commit()
            melden(ctx, v, neu.length())
        }
    }

    /** Eigene Benachrichtigung: „12,50 € bei Edeka erkannt – tippen zum Buchen“. */
    private fun melden(ctx: Context, v: JSONObject, anzahl: Int) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
            val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(KANAL) == null)
                nm.createNotificationChannel(NotificationChannel(KANAL, "Erkannte Zahlungen (Beta)", NotificationManager.IMPORTANCE_DEFAULT))
            val i = Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse("finanz://vorschlaege"))
                .putExtra(Kurzbefehle.AUFTRAG, "vorschlaege").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val pi = PendingIntent.getActivity(ctx, 4711, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val h = v.optString("haendler")
            val titel = Logik.euro(v.optDouble("betrag")) + (if (h.isNotEmpty()) " bei $h" else "") + " erkannt"
            val n = NotificationCompat.Builder(ctx, KANAL)
                .setSmallIcon(R.drawable.ic_finanz_vorne)
                .setContentTitle(titel)
                .setContentText(if (anzahl > 1) "$anzahl Zahlungen warten · tippen zum Buchen (Beta)" else "Tippen zum Buchen · über " + v.optString("appName") + " (Beta)")
                .setContentIntent(pi).setAutoCancel(true).setOnlyAlertOnce(true)
                .setColor(0xFF3A6B5C.toInt())
                .build()
            NotificationManagerCompat.from(ctx).notify(4711, n)
        } catch (e: Exception) { }
    }

    fun meldungWeg(ctx: Context) { try { NotificationManagerCompat.from(ctx).cancel(4711) } catch (e: Exception) { } }
}

class ZahlungsLeser : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        try {
            val n = sbn.notification ?: return
            if ((n.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
            if (sbn.isOngoing) return
            val e = n.extras ?: return
            val titel = e.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
            val text = (e.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: e.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
            Erkennung.verarbeite(applicationContext, sbn.packageName, titel, text, sbn.postTime)
        } catch (ex: Exception) { }
    }
}
