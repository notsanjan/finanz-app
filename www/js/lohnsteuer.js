// Lohnsteuer 2026 nach dem amtlichen Programmablaufplan (PAP) des BMF
// Quelle: BMF-Schreiben vom 12.11.2025 (IV C 5 - S 2361/00025/016/028), Anlage 1,
// XML-Pseudocode „Lohnsteuer2026.xml“. Übertragen für laufenden Arbeitslohn:
// keine Versorgungsbezüge, kein Altersentlastungsbetrag. Sonstige Bezüge (z. B. Jahressonderzahlung)
// rechnet sonstigerBezug() vereinfacht über die Jahreslohnsteuer (Differenzmethode, § 39b Abs. 3 EStG).
// Alle Beträge an der Schnittstelle in Cent (ganze Zahlen), Sätze in Prozent – wie im PAP.

// ---- exakte Dezimalzahl wie Java-BigDecimal (nur was der PAP braucht) ----
const P10 = (n) => 10n ** BigInt(n);
class Dez {
  constructor(m, s = 0) { this.m = BigInt(m); this.s = s; }
  static von(x) {
    if (x instanceof Dez) return x;
    const t = typeof x === 'bigint' ? x.toString() : String(x);
    const neg = t.startsWith('-'); const r = neg ? t.slice(1) : t;
    const [g, k = ''] = r.split('.');
    return new Dez(BigInt((neg ? '-' : '') + (g || '0') + k), k.length);
  }
  auf(s) { return s >= this.s ? new Dez(this.m * P10(s - this.s), s) : null; }
  plus(o) { o = Dez.von(o); const s = Math.max(this.s, o.s); return new Dez(this.auf(s).m + o.auf(s).m, s); }
  minus(o) { o = Dez.von(o); const s = Math.max(this.s, o.s); return new Dez(this.auf(s).m - o.auf(s).m, s); }
  mal(o) { o = Dez.von(o); return new Dez(this.m * o.m, this.s + o.s); }
  // Division auf `stellen` Nachkommastellen; art 'ab' = ROUND_DOWN (Richtung 0), 'auf' = ROUND_UP (weg von 0)
  durch(o, stellen = 10, art = 'ab') {
    o = Dez.von(o);
    const zaehler = this.m * P10(o.s + stellen); const nenner = o.m * P10(this.s);
    let q = zaehler / nenner; const rest = zaehler % nenner;
    if (art === 'auf' && rest !== 0n) q += ((zaehler < 0n) !== (nenner < 0n)) ? -1n : 1n;
    return new Dez(q, stellen);
  }
  runde(stellen, art = 'ab') { return this.durch(1, stellen, art); }
  vgl(o) { o = Dez.von(o); const s = Math.max(this.s, o.s); const a = this.auf(s).m, b = o.auf(s).m; return a < b ? -1 : a > b ? 1 : 0; }
  zahl() { return Number(this.m) / 10 ** this.s; }
}
const D = Dez.von;
const NULL = D(0);

/**
 * Lohnsteuer, Solidaritätszuschlag und Bemessungsgrundlage Kirchensteuer für einen Lohnzahlungszeitraum.
 * @param {object} e Eingangsparameter mit PAP-Namen: LZZ (1 Jahr, 2 Monat, 3 Woche, 4 Tag), RE4 (Cent), STKL (1–6),
 *   KVZ (Zusatzbeitrag in %, voller Satz), PVZ (1 = Kinderlosenzuschlag), PVS (1 = Sachsen), PVA (Zahl der Abschläge 0–4),
 *   ZKF (Kinderfreibeträge), R (Religion, 0 = keine), KRV, ALV, PKV, PKPV, PKPVAGZ, LZZFREIB, LZZHINZU (Cent), af, f
 * @returns {{LSTLZZ:number, SOLZLZZ:number, BK:number}} in Cent
 */
export function lohnsteuer2026(e) {
  const LZZ = e.LZZ ?? 1, STKL = e.STKL ?? 1, R = e.R ?? 0, KRV = e.KRV ?? 0, ALV = e.ALV ?? 0, PKV = e.PKV ?? 0;
  const RE4 = D(e.RE4 ?? 0), KVZ = D(e.KVZ ?? 0), PVA = D(e.PVA ?? 0), ZKF = D(e.ZKF ?? 0);
  const LZZFREIB = D(e.LZZFREIB ?? 0), LZZHINZU = D(e.LZZHINZU ?? 0), PKPV = D(e.PKPV ?? 0), PKPVAGZ = D(e.PKPVAGZ ?? 0);
  let f = (e.af ?? 1) === 0 ? 1 : (e.f ?? 1);

  // MPARA
  const BBGRVALV = D(101400), AVSATZAN = D('0.013'), RVSATZAN = D('0.093'), BBGKVPV = D(69750);
  const KVSATZAN = KVZ.durch(2).durch(100).plus('0.07');
  let PVSATZAN = (e.PVS ?? 0) === 1 ? D('0.023') : D('0.018');
  PVSATZAN = (e.PVZ ?? 0) === 1 ? PVSATZAN.plus('0.006') : PVSATZAN.minus(PVA.mal('0.0025'));
  const W1STKL5 = D(14071), W2STKL5 = D(34939), W3STKL5 = D(222260), GFB = D(12348);
  let SOLZFREI = D(20350);

  // MRE4JL
  const hoch = (b) => LZZ === 1 ? b.durch(100, 2) : LZZ === 2 ? b.mal(12).durch(100, 2) : LZZ === 3 ? b.mal(360).durch(700, 2) : b.mal(360).durch(100, 2);
  const ZRE4J = hoch(RE4), JLFREIB = hoch(LZZFREIB), JLHINZU = hoch(LZZHINZU);

  // MRE4 / MRE4ALTE ohne Versorgungsbezüge und Altersentlastung: FVB = FVBZ = ALTE = 0
  let ZRE4, ZRE4VP;
  const mre4abz = () => {
    ZRE4 = ZRE4J.minus(JLFREIB).plus(JLHINZU).runde(2);
    if (ZRE4.vgl(0) < 0) ZRE4 = NULL;
    ZRE4VP = ZRE4J;
  };
  mre4abz();

  // MZTABFB
  let ANP = NULL, SAP = NULL, EFA = NULL, KFB = NULL, KZTAB = 1;
  if (STKL < 6 && ZRE4.vgl(0) > 0) ANP = ZRE4.vgl(1230) < 0 ? ANP.plus(ZRE4).runde(0, 'auf') : ANP.plus(1230);
  if (STKL === 1) { SAP = D(36); KFB = ZKF.mal(9756).runde(0); }
  else if (STKL === 2) { EFA = D(4260); SAP = D(36); KFB = ZKF.mal(9756).runde(0); }
  else if (STKL === 3) { KZTAB = 2; SAP = D(36); KFB = ZKF.mal(9756).runde(0); }
  else if (STKL === 4) { SAP = D(36); KFB = ZKF.mal(4878).runde(0); }
  else if (STKL === 5) { SAP = D(36); KFB = NULL; }
  else KFB = NULL;
  let ZTABFB = EFA.plus(ANP).plus(SAP).runde(2);

  // UPTAB26 (§ 32a EStG 2026)
  const uptab26 = (X) => {
    let ST;
    if (X.vgl(GFB.plus(1)) < 0) ST = NULL;
    else if (X.vgl(17800) < 0) { const Y = X.minus(GFB).durch(10000, 6); ST = Y.mal('914.51').plus(1400).mal(Y).runde(0); }
    else if (X.vgl(69879) < 0) { const Y = X.minus(17799).durch(10000, 6); ST = Y.mal('173.1').plus(2397).mal(Y).plus('1034.87').runde(0); }
    else if (X.vgl(277826) < 0) ST = X.mal('0.42').minus('11135.63').runde(0);
    else ST = X.mal('0.45').minus('19470.38').runde(0);
    return ST.mal(KZTAB);
  };
  // UP5_6 / MST5_6 (Steuerklassen V und VI)
  const up56 = (ZX) => {
    const ST1 = uptab26(ZX.mal('1.25').runde(0));
    const ST2 = uptab26(ZX.mal('0.75').runde(0));
    const DIFF = ST1.minus(ST2).mal(2);
    const MIST = ZX.mal('0.14').runde(0);
    return MIST.vgl(DIFF) > 0 ? MIST : DIFF;
  };
  const mst56 = (X) => {
    const ZZX = X;
    if (ZZX.vgl(W2STKL5) > 0) {
      let ST = up56(W2STKL5);
      if (ZZX.vgl(W3STKL5) > 0) {
        ST = ST.plus(W3STKL5.minus(W2STKL5).mal('0.42')).runde(0);
        return ST.plus(ZZX.minus(W3STKL5).mal('0.45')).runde(0);
      }
      return ST.plus(ZZX.minus(W2STKL5).mal('0.42')).runde(0);
    }
    let ST = up56(ZZX);
    if (ZZX.vgl(W1STKL5) > 0) {
      const VERGL = ST;
      const HOCH = up56(W1STKL5).plus(ZZX.minus(W1STKL5).mal('0.42')).runde(0);
      ST = HOCH.vgl(VERGL) < 0 ? HOCH : VERGL;
    }
    return ST;
  };

  // UPEVP / MVSPKVPV / MVSPHB (Vorsorgepauschale 2026)
  const upevp = () => {
    let VSPR = NULL;
    if (KRV !== 1) VSPR = (ZRE4VP.vgl(BBGRVALV) > 0 ? BBGRVALV : ZRE4VP).mal(RVSATZAN).runde(2);
    const zkv = ZRE4VP.vgl(BBGKVPV) > 0 ? BBGKVPV : ZRE4VP;
    let VSPKVPV;
    if (PKV > 0) {
      if (STKL === 6) VSPKVPV = NULL;
      else {
        const PKPVAGZJ = PKPVAGZ.mal(12).durch(100).runde(2);
        VSPKVPV = PKPV.mal(12).durch(100).runde(2).minus(PKPVAGZJ);
        if (VSPKVPV.vgl(0) < 0) VSPKVPV = NULL;
      }
    } else VSPKVPV = zkv.mal(KVSATZAN.plus(PVSATZAN)).runde(2);
    let VSP = VSPKVPV.plus(VSPR).runde(0, 'auf');
    if (ALV !== 1 && STKL !== 6) {
      const VSPALV = AVSATZAN.mal(ZRE4VP.vgl(BBGRVALV) > 0 ? BBGRVALV : ZRE4VP).runde(2);
      let VSPHB = VSPALV.plus(VSPKVPV).runde(2);
      if (VSPHB.vgl(1900) > 0) VSPHB = D(1900);
      const VSPN = VSPR.plus(VSPHB).runde(0, 'auf');
      if (VSPN.vgl(VSP) > 0) VSP = VSPN;
    }
    return VSP;
  };

  // MLSTJAHR + UPMLST
  const mlstjahr = () => {
    const VSP = upevp();
    let ZVE = ZRE4.minus(ZTABFB).minus(VSP);
    let X;
    if (ZVE.vgl(1) < 0) { ZVE = NULL; X = NULL; } else X = ZVE.durch(KZTAB, 10).runde(0);
    return { ST: STKL < 5 ? uptab26(X) : mst56(X), ZVE };
  };
  const anteil = (JW) => LZZ === 1 ? JW : LZZ === 2 ? JW.durch(12, 0) : LZZ === 3 ? JW.mal(7).durch(360, 0) : JW.durch(360, 0);

  // MBERECH
  const fD = D(f);
  let { ST } = mlstjahr();
  const LSTJAHR = ST.mal(fD).runde(0);
  const LSTLZZ = anteil(LSTJAHR.mal(100));
  let JBMG;
  if (ZKF.vgl(0) > 0) {
    ZTABFB = ZTABFB.plus(KFB);
    mre4abz();
    ({ ST } = mlstjahr());
    JBMG = ST.mal(fD).runde(0);
  } else JBMG = LSTJAHR;

  // MSOLZ
  SOLZFREI = SOLZFREI.mal(KZTAB);
  let SOLZLZZ = NULL;
  if (JBMG.vgl(SOLZFREI) > 0) {
    let SOLZJ = JBMG.mal('5.5').durch(100).runde(2);
    const SOLZMIN = JBMG.minus(SOLZFREI).mal('11.9').durch(100).runde(2);
    if (SOLZMIN.vgl(SOLZJ) < 0) SOLZJ = SOLZMIN;
    SOLZLZZ = anteil(SOLZJ.mal(100).runde(0));
  }
  const BK = R > 0 ? anteil(JBMG.mal(100)) : NULL;
  return { LSTLZZ: LSTLZZ.zahl(), SOLZLZZ: SOLZLZZ.zahl(), BK: BK.zahl(), LSTJAHR: LSTJAHR.zahl(), JBMG: JBMG.zahl() };
}

/**
 * Steuer auf einen sonstigen Bezug (z. B. Jahressonderzahlung) – vereinfacht:
 * Jahressteuer auf (Jahreslohn + Bezug) minus Jahressteuer auf den Jahreslohn (§ 39b Abs. 3 EStG).
 * @param {object} e Eingangsparameter wie lohnsteuer2026, RE4 = Monatslohn (Cent)
 * @param {number} sonstbCent sonstiger Bezug in Cent
 * @returns {{LST:number, SOLZ:number, BK:number}} in Cent
 */
export function sonstigerBezug2026(e, sonstbCent) {
  const jahr = Math.round((e.RE4 || 0) * 12);
  const ohne = lohnsteuer2026({ ...e, LZZ: 1, RE4: jahr });
  const mit = lohnsteuer2026({ ...e, LZZ: 1, RE4: jahr + Math.round(sonstbCent) });
  // Soli auf sonstige Bezüge: Differenz der Jahres-Soli (Freigrenze/Milderungszone wirken mit)
  return { LST: mit.LSTLZZ - ohne.LSTLZZ, SOLZ: mit.SOLZLZZ - ohne.SOLZLZZ, BK: mit.BK - ohne.BK };
}
