package de.jan.finanzapp

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import org.json.JSONObject

/**
 * Schnell erfassen ohne Umweg:
 * - Intent für „Ausgabe eintragen“ (optional mit Kategorie), genutzt vom Widget und von den Kurzbefehlen
 * - Kurzbefehle am App-Symbol (lange drücken): „Ausgabe eintragen“ + die 3 meistgenutzten Budget-Kategorien
 */
object Kurzbefehle {
    const val AUFTRAG = "finanz_auftrag"
    const val KATEGORIE = "finanz_kategorie"

    fun eintragenIntent(ctx: Context, katId: String?): Intent =
        Intent(ctx, MainActivity::class.java)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("finanz://eintragen/" + (katId ?: "")))
            .putExtra(AUFTRAG, "ausgabe")
            .putExtra(KATEGORIE, katId ?: "")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    private fun symbol(name: String?): Int = when (name) {
        "wagen" -> R.drawable.ic_wagen
        "tanken" -> R.drawable.ic_tanken
        "freizeit" -> R.drawable.ic_freizeit
        else -> R.drawable.ic_sonstiges
    }

    fun aktualisieren(ctx: Context, daten: JSONObject?) {
        try {
            val liste = mutableListOf<ShortcutInfoCompat>()
            liste.add(
                ShortcutInfoCompat.Builder(ctx, "ausgabe")
                    .setShortLabel("Ausgabe eintragen")
                    .setLongLabel("Ausgabe eintragen")
                    .setIcon(IconCompat.createWithResource(ctx, R.drawable.ic_sonstiges))
                    .setIntent(eintragenIntent(ctx, null))
                    .setRank(0)
                    .build()
            )
            if (daten != null) {
                // meistgenutzte Budget-Kategorien der letzten 60 Tage zuerst
                val zaehler = mutableMapOf<String, Int>()
                val b = daten.optJSONArray("buchungen")
                val grenze = Logik.ymPlus(Logik.monatText(), -2)
                if (b != null) for (i in 0 until b.length()) {
                    val o = b.getJSONObject(i)
                    if (o.optString("zeit") >= grenze) zaehler[o.optString("kategorieId")] = (zaehler[o.optString("kategorieId")] ?: 0) + 1
                }
                val kats = Logik.budgetKategorien(daten).sortedByDescending { zaehler[it.optString("id")] ?: 0 }.take(3)
                for ((n, k) in kats.withIndex()) {
                    val emoji = k.optString("emoji", "").takeIf { it.isNotBlank() && it != "null" }
                    val name = k.optString("name")
                    liste.add(
                        ShortcutInfoCompat.Builder(ctx, "kat_" + k.optString("id"))
                            .setShortLabel(if (emoji != null) "$emoji $name" else name)
                            .setLongLabel("$name eintragen")
                            .setIcon(IconCompat.createWithResource(ctx, symbol(k.optString("symbol"))))
                            .setIntent(eintragenIntent(ctx, k.optString("id")))
                            .setRank(n + 1)
                            .build()
                    )
                }
            }
            ShortcutManagerCompat.setDynamicShortcuts(ctx, liste)
        } catch (e: Exception) {
            // Kurzbefehle sind ein Extra: Fehler hier dürfen das Speichern nicht stören
        }
    }
}
