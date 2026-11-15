package de.jan.finanzapp

import android.content.ContentValues
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

    override fun handleOnResume() {
        super.handleOnResume()
        notifyListeners("fortgesetzt", JSObject())
    }
}
