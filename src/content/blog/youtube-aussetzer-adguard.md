---
title: Wenn YouTube „offline" sagt, aber der Ping durchgeht
description: Eine DNS-Detektivgeschichte aus meinem Homelab — wie eine gut gemeinte AdGuard-Regel meine YouTube-Wiedergabe zerschoss und warum ein nslookup mich fast in die Irre führte.
date: 2026-06-22
tags:
  - homelab
  - adguard
  - dns
  - ipv6
  - troubleshooting
---

Es fing harmlos an. Ich konnte plötzlich einen meiner Server über seine Domain nicht mehr
erreichen — eine eigene Domain mit `.win`-Endung. Die IP direkt anpingen ging problemlos,
andere DNS-Resolver fanden die Domain auch. Nur mein eigenes Netz nicht. Klarer Fall: DNS.

## Episode 1: Die ganze TLD war weg

Mein DNS läuft im Homelab über **AdGuard Home**. Ich habe mir die Auflösung angeschaut und
sofort das verräterische Muster gesehen: Die Domain löste auf `0.0.0.0` bzw. `::` auf — die
klassische „geblockt"-Antwort von AdGuard. Kein Netzwerkproblem, eine Blockliste.

Die Ursache war kurios: Eine meiner aktiven Listen (HaGeZi's _„The World's Most Abused TLDs"_)
sperrt die komplette `.win`-Top-Level-Domain, weil sie massenhaft für Spam und Malware
missbraucht wird. Meine eigene Domain wurde da einfach mitgefangen. Lösung: eine Ausnahme in
die Allowlist (`@@||meine-domain^`), und schon war sie wieder erreichbar.

Eine Sache, die ich mir dabei gemerkt habe: AdGuard schreibt seine `AdGuardHome.yaml` beim
Stoppen aus dem RAM zurück. Wer die Datei bei laufendem Dienst editiert, dessen Änderung wird
beim nächsten Stop überschrieben. Die richtige Reihenfolge ist immer **stop → edit → start**.

So weit, so schnell gelöst. Das eigentliche Rätsel kam danach.

## Episode 2: YouTube stockt — aber nur bei mir

Seit Wochen hatte ich auf YouTube immer wieder Aussetzer. Mal stockte die Wiedergabe, mal
stand mitten im Scrollen „**Verbindung zum Internet herstellen — Du bist offline**" auf dem
Schirm. Das Nervige: Ich habe YouTube Premium, bekomme also gar keine Werbung. Mein erster
Reflex war deshalb: „Dann entblocke ich YouTube halt in AdGuard, vielleicht hilft's." Ich
hatte das sogar schon versucht — es brachte nichts.

Bevor ich blind weitermachte, habe ich das Problem sauber eingegrenzt. Und das ist die
eigentliche Lektion dieses Posts.

### Erst messen, dann schrauben

Ich bin der Reihe nach durchgegangen:

- **Auflösung:** YouTube und die Video-CDN-Domains lösten sauber auf — echte Google-IPs, kein
  `0.0.0.0`. YouTube war auf DNS-Ebene also gar nicht blockiert. Mein „Entblocken" konnte
  nichts bringen, weil es nichts zu entblocken gab.
- **Uplink:** Ping zu Googles CDN über IPv4 _und_ IPv6 — null Paketverlust, \~16 ms, saubere
  Path-MTU. Der Internetzugang war kerngesund.
- **Umfang:** Nur ein Gerät betroffen. Per Kabel. Nur YouTube — Netflix, Twitch und Co. liefen
  flüssig.

Damit fielen reihenweise Verdächtige weg: kein DNS-Block, kein WLAN, kein Uplink, kein
netzwerkweites Problem. Ich war kurz davor, es auf den Browser zu schieben — bis ich es im
Inkognito-Modus _und_ in einem zweiten Browser reproduzierte. Systemweit also, nicht der
Browser.

### Die falsche Fährte: IPv6

Meine Arbeitshypothese war ein kaputter IPv6-Pfad. Moderne Clients bevorzugen IPv6
(Happy Eyeballs), und wenn das schlecht routet, gibt es genau solche Timeouts. Also habe ich
am PC direkt getestet: `ping -6` zu YouTube — und es lief tadellos, 0 % Verlust, sogar während
das Problem auftrat. Hypothese widerlegt. Gut, dass ich gemessen statt geraten habe.

Aber wenn IPv6 funktioniert und trotzdem „offline" kommt, obwohl der Ping durchgeht — dann
wird eine _bestimmte Domain_ geblockt, die YouTube zum Funktionieren braucht.

### Das Query-Log lügt nicht

Statt weiter zu raten, habe ich ins **AdGuard Query-Log** geschaut und mit KI-Unterstützung
die Einträge meiner Client-IP nach geblockten Google-/YouTube-Domains gefiltert. Das Ergebnis
war ein Faustschlag:

| Domain | geblockt |
| --- | --- |
| `www.youtube.com` | mehrere Tausend Mal |
| `accounts.youtube.com` | über tausend Mal |
| die `googlevideo.com`-Streamingserver | massenhaft |

Über 26.000 Blocks insgesamt. Das waren nicht die Werbe-Domains — das war die **Kernfunktion**
von YouTube: Feed, Login, Thumbnails, der eigentliche Videostream. Die KI hat mir im Log die
exakte Regel gezeigt, die das auslöste, und damit kam die Wahrheit ans Licht.

### Die Pointe: mein eigener alter „Fix"

Die Regeln, die das verursachten, sahen so aus:

```plain
||www.youtube.com^$dnstype=AAAA
||googlevideo.com^$dnstype=AAAA
||ytimg.com^$dnstype=AAAA
```

Das waren **AAAA-Block-Regeln** — irgendwann hatte ich sie selbst eingebaut, um YouTube auf
IPv4 zu zwingen (ein bekannter Anti-Buffering-Trick). Die Idee: IPv6 für YouTube unterdrücken.
Der Haken: Mein Client _wollte_ IPv6 (das ja einwandfrei funktionierte), bekam aber für die
Video- und Feed-Domains keine AAAA-Antwort mehr. Vermischt mit dem optimistischen DNS-Cache
führte das zu abgebrochenen Verbindungen — genau den Aussetzern und „offline"-Meldungen.

Mein gut gemeinter Fix von damals war zur Ursache geworden. Und das Beste: Mein
ursprünglicher Instinkt — „YouTube entblocken" — war eigentlich richtig. Die Blockade saß nur
nicht da, wo ich zuerst gesucht hatte.

## Wo mich ein Schnelltest beinahe ausgetrickst hätte

Eine ehrliche Stelle, die ich nicht verschweigen will: Früh im Prozess hatte ich mit einem
einzelnen `nslookup` geprüft, ob die AAAA-Regeln greifen — und bekam echte IPv6-Adressen
zurück. Daraus schloss ich, die Regeln seien wirkungslos. Falsch. Das Query-Log bewies das
Gegenteil: Sie blockten zu Zehntausenden. Die Einzelabfrage hatte mich durch Caching getäuscht.

**Lektion:** Zur Verifikation, ob etwas blockiert wird, ist das Query-Log die Wahrheit — nicht
eine Handvoll Stichproben. Stichproben können durch Caches lügen.

## Was übrig bleibt

Ich habe die fünf AAAA-Regeln entfernt (brav per stop → edit → start), die YouTube-Domains
lösen seitdem wieder sauber über IPv4 _und_ IPv6 auf, und auf der Client-Seite einmal den
DNS-Cache geleert (`ipconfig /flushdns` plus den internen DNS-Cache des Browsers).

Mitnehmen würde ich drei Dinge:

1. **Aggressive Blocklisten fangen Beifang.** Eine ganze TLD oder die AAAA-Records einer
   legitimen Seite zu sperren, hat Nebenwirkungen, die erst Wochen später auffallen.
2. **„Offline" trotz funktionierendem Ping = DNS oder eine einzelne Domain.** Wenn ICMP läuft,
   die App aber „keine Verbindung" meldet, fehlt meist ein ganz bestimmter Endpunkt.
3. **Messen schlägt Raten — und das richtige Werkzeug schlägt das schnelle.** Das Query-Log
   hat in fünf Minuten geklärt, was ich vorher wochenlang falsch eingeschätzt hatte.

Manchmal ist der hartnäckigste Bug im Homelab nicht der des Herstellers, sondern der eigene
Workaround von vor einem halben Jahr, den man längst vergessen hat.
