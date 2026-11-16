package de.jan.finanzapp

import android.Manifest
import android.app.AppOpsManager
import android.net.Uri
import android.content.ContentValues
import android.content.pm.PackageManager
import android.provider.Settings
import com.getcapacitor.JSArray
import android.content.Context
import android.content.Intent
import android.view.inputmethod.InputMethodManager
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/** Brücke zwischen Web-App und Android: Daten lesen/schreiben, Widgets auffrischen, Sicherung exportieren. */
@CapacitorPlugin(name = "FinanzSpeicher")
class FinanzSpeicherPlugin : Plugin() {

    @PluginMethod
    fun laden(call: PluginCall) {
        val r = JSObject()
        val text = Speicher.lesenText(context)
        if (text != null) r.put("daten", text)
        call.resolve(r)
    }

    @PluginMethod
    fun speichern(call: PluginCall) {
        val text = call.getString("daten")
        if (text == null) { call.reject("Keine Daten übergeben"); return }
        Speicher.schreibenText(context, text)
        Widgets.alleAktualisieren(context)
        Kurzbefehle.aktualisieren(context, Speicher.lesen(context))
        call.resolve()
    }

    @PluginMethod
    fun exportieren(call: PluginCall) {
        val name = call.getString("dateiname") ?: "finanz-sicherung.json"
        val inhalt = call.getString("inhalt")
        if (inhalt == null) { call.reject("Kein Inhalt"); return }
        try {
            val pfad: String
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val werte = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, "application/json")
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val uri = context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, werte)
                    ?: throw IllegalStateException("Downloads-Ordner nicht erreichbar")
                context.contentResolver.openOutputStream(uri)?.use { it.write(inhalt.toByteArray(Charsets.UTF_8)) }
                    ?: throw IllegalStateException("Datei lässt sich nicht schreiben")
                pfad = "Downloads/$name"
            } else {
                val ordner = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: context.filesDir
                val datei = File(ordner, name)
                datei.writeText(inhalt, Charsets.UTF_8)
                pfad = datei.absolutePath
            }
            val r = JSObject()
            r.put("pfad", pfad)
            call.resolve(r)
        } catch (e: Exception) {
            call.reject(e.message ?: "Export fehlgeschlagen")
        }
    }

    /** Auftrag aus Widget oder Kurzbefehl („Ausgabe eintragen“, optional mit Kategorie). Wird nach dem Lesen gelöscht. */
    @PluginMethod
    fun auftragHolen(call: PluginCall) {
        val r = JSObject()
        val i = activity?.intent
        val ausVerlauf = i != null && (i.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0
        val art = i?.getStringExtra(Kurzbefehle.AUFTRAG)
        if (i != null && art != null && !ausVerlauf) {
            r.put("art", art)
            r.put("kategorie", i.getStringExtra(Kurzbefehle.KATEGORIE) ?: "")
        }
        i?.removeExtra(Kurzbefehle.AUFTRAG)
        i?.removeExtra(Kurzbefehle.KATEGORIE)
        call.resolve(r)
    }

    /** Tastatur öffnen (ein focus() aus JavaScript reicht in der WebView ohne Fingertipp nicht). */
    @PluginMethod
    fun tastaturZeigen(call: PluginCall) {
        val web = bridge?.webView
        activity?.runOnUiThread {
            if (web != null) {
                web.requestFocus()
                val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
                imm.showSoftInput(web, InputMethodManager.SHOW_IMPLICIT)
            }
            call.resolve()
        }
    }

    /** Haptik nach Bedeutung: bestaetigt, fehler, tick, gegriffen */
    @PluginMethod
    fun haptik(call: PluginCall) {
        val art = call.getString("art") ?: "tick"
        val web = bridge?.webView
        activity?.runOnUiThread {
            if (web != null) Haptik.anAnsicht(web, art)
            call.resolve()
        }
    }

    // ---------- BETA: Zahlungen aus Benachrichtigungen ----------
    @PluginMethod
    fun erkennungStatus(call: PluginCall) {
        val r = JSObject()
        r.put("verfuegbar", true)
        r.put("an", Erkennung.eingeschaltet(context))
        r.put("erlaubt", Erkennung.erlaubt(context))
        r.put("meldungen", Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
        r.put("apps", JSArray(Erkennung.apps(context).toString()))
        // v30: Android 13+ sperrt den Zugriff für Apps, die nicht aus einem App-Store kommen („eingeschränkte Einstellungen“)
        r.put("eingeschraenkt", nichtAusStore())
        val f = freigabe()
        if (f != null) r.put("freigegeben", f)
        call.resolve(r)
    }

    /** true, wenn die App per APK (Browser, Dateien) installiert wurde – dann gilt die Sperre ab Android 13. */
    private fun nichtAusStore(): Boolean {
        if (Build.VERSION.SDK_INT < 33) return false
        return try {
            val q = context.packageManager.getInstallSourceInfo(context.packageName)
            q.packageSource != PackageManager.PACKAGE_SOURCE_STORE
        } catch (e: Exception) { true }
    }

    /** Hat der Nutzer „Eingeschränkte Einstellungen zulassen“ schon getippt? null = lässt sich nicht feststellen. */
    private fun freigabe(): Boolean? {
        if (Build.VERSION.SDK_INT < 33) return null
        return try {
            val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
            val modus = ops.unsafeCheckOpNoThrow("android:access_restricted_settings", context.applicationInfo.uid, context.packageName)
            modus == AppOpsManager.MODE_ALLOWED
        } catch (e: Exception) { null }
    }

    /** Öffnet die App-Infos der Finanz-App (dort: ⋮ → „Eingeschränkte Einstellungen zulassen“). */
    @PluginMethod
    fun appInfoOeffnen(call: PluginCall) {
        try {
            val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
            call.resolve()
        } catch (e: Exception) { call.reject(e.message ?: "App-Infos nicht erreichbar") }
    }

    @PluginMethod
    fun erkennungEinstellen(call: PluginCall) {
        val an = call.getBoolean("an", false) ?: false
        Erkennung.setzeEin(context, an)
        if (an && Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            activity?.requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 4712)
        call.resolve()
    }

    @PluginMethod
    fun erkennungApp(call: PluginCall) {
        val paket = call.getString("paket")
        if (paket == null) { call.reject("Kein Paket"); return }
        Erkennung.setzeApp(context, paket, call.getBoolean("an", false) ?: false)
        call.resolve()
    }

    /** Öffnet die Android-Einstellung „Zugriff auf Benachrichtigungen“. */
    @PluginMethod
    fun erkennungErlauben(call: PluginCall) {
        try {
            val i = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
            call.resolve()
        } catch (e: Exception) { call.reject(e.message ?: "Einstellungen nicht erreichbar") }
    }

    @PluginMethod
    fun vorschlaegeHolen(call: PluginCall) {
        val r = JSObject()
        r.put("liste", JSArray(Erkennung.vorschlaege(context).toString()))
        call.resolve(r)
    }

    @PluginMethod
    fun vorschlaegeEntfernen(call: PluginCall) {
        val ids = call.getArray("ids")
        val set = mutableSetOf<String>()
        if (ids != null) for (i in 0 until ids.length()) set.add(ids.getString(i))
        Erkennung.entfernen(context, set)
        if (Erkennung.vorschlaege(context).length() == 0) Erkennung.meldungWeg(context)
        call.resolve()
    }

    override fun handleOnNewIntent(intent: Intent) {
        super.handleOnNewIntent(intent)
        activity?.intent = intent
        notifyListeners("auftrag", JSObject())
    }

    override fun handleOnResume() {
        super.handleOnResume()
        notifyListeners("fortgesetzt", JSObject())
    }
}
