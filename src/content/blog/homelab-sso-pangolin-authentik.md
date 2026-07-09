---
title: 'Ein Edge für alles: Homelab-SSO mit Pangolin und Authentik'
description: Wie ich zwei Reverse Proxies und einen fremden Server durch einen einzigen selbst-gehosteten Edge mit zentralem Single-Sign-On ersetzt habe — inklusive eines Postgres-Bugs im Installer, eines selbstverschuldeten netzweiten DNS-Ausfalls und einer API, die offiziell gar nicht lief.
date: 2026-07-08
tags:
  - homelab
  - pangolin
  - authentik
  - sso
  - traefik
  - reverse-proxy
draft: false
---

Meine Homelab-Dienste waren zuletzt auf zwei Wege nach außen erreichbar, und beide hatten
einen Haken. Die nutzerseitigen Dienste (Jellyfin, Vaultwarden, die Portfolio-Startseite)
liefen seit dem [Ingress-Umzug](/blog/netzwerk-upgrade) direkt über meinen Heimanschluss und
einen Caddy-Reverse-Proxy. Alles andere — die \*arr-Suite, Dashboards, Admin-Oberflächen — hing
noch an einem **geteilten Dedicated-Server**, der ein Pangolin als Reverse Proxy fuhr und über
einen IPsec-Tunnel zu mir nach Hause zurückroutete.

Der Dedicated-Weg hatte ein hässliches Symptom: Aus manchen Netzen — vor allem **Mobilfunk** —
starben Verbindungen im Timeout, während sie aus dem Heimnetz und aus Rechenzentren tadellos
liefen. Die Ursache lag am Pangolin-Edge des fremden Servers (vermutlich IP-Reputation gegen
CGNAT-Ranges), und da mir der Server nicht allein gehört, konnte ich das nicht fixen.

Also der Plan: **ein einziger, selbst-gehosteter Edge**, der Caddy _und_ den Dedicated ablöst,
mit **zentralem Single-Sign-On** davor. Reverse Proxy: Pangolin (bringt Traefik mit).
Identity Provider: Authentik. Quasi die selbe Architektur, die auch schon auf dem Dedicated-Server lief.
Klingt nach einem Nachmittag. Es wurden mehrere Tage — und die
interessanten Teile waren wie immer die, die im Plan nicht standen. Wie schon beim
[Firewall-Audit](/blog/firewall-audit-zero-trust) hatte ich eine KI als Zuarbeiterin am
Terminal; die eigentliche Arbeit war, jeden ihrer Schritte empirisch gegenzuprüfen.

## Die Zielarchitektur

Zwei neue LXC-Container auf dem Proxmox-Host, beide im Server-VLAN:

- **Authentik** — der OIDC-Identity-Provider. Ein Login, eine Nutzerdatenbank.
- **Pangolin + Traefik** — der einzige Reverse Proxy für WAN _und_ LAN. Kein Tunnel, keine
  Newt/Gerbil-Schicht: Pangolins Ressourcen zeigen direkt auf die internen Dienst-IPs, weil
  alles im selben Netz liegt.

Der Datenfluss danach:

```plain
Internet → Cloudflare (Wildcard *.vugas.de → Heim-IP via DDNS)
         → OPNsense (WAN:443 → Pangolin)
         → Traefik (Wildcard-TLS, SSO-Wall)
         → Authentik (OIDC)  bzw. direkt → Backend-Dienst
```

Im LAN rewrited AdGuard alle `*.vugas.de` direkt auf Pangolin, sodass Heimgeräte gar nicht erst
den Umweg über die öffentliche IP nehmen. Drei Auth-Klassen sortieren die Dienste:

- **Public** — Portfolio, Jellyfin, Vaultwarden, die Statusseite: eigene App-Anmeldung, keine
  SSO-Wall (Familie und Fremde haben keine Authentik-Accounts).
- **Gated** — \*arr, SABnzbd, Paperless, Firefly, Proxmox-Web, OPNsense-Web und Co.: Pangolin
  erzwingt davor den Authentik-Login.
- **Break-glass** — jeder Dienst bleibt intern per Direkt-IP erreichbar, falls SSO mal steht.

So weit die Theorie. Jetzt zu den Stellen, an denen die Realität zurückschlug.

## Bug 1: Ein Schrägstrich, der Postgres unerreichbar machte

Pangolins Installer lief durch, zog die Container — und der Hauptcontainer blieb hartnäckig
`unhealthy`. Postgres war gesund, aber Pangolin kam nicht dran: `ECONNREFUSED` bei jeder
Migration. Kurioserweise **verband sich `curl` aus demselben Container problemlos** mit
`postgres:5432`. TCP funktionierte, die Anwendung nicht.

Der Fehler war ein `AggregateError` mit _zwei_ gebündelten Refused — die Signatur von
`localhost` (127.0.0.1 **und** ::1). Die Anwendung versuchte also gar nicht, `postgres`
anzusprechen. Ein kleines Parser-Skript brachte es an den Tag: Der vom Installer generierte
Postgres-Connection-String sah (schematisch) so aus:

```plain
postgresql://pangolin:/xxxxx@postgres:5432/pangolin
```

Das automatisch erzeugte Passwort **begann mit einem Schrägstrich** (das Base64-Alphabet
enthält `/` und `+`). In einer URL beendet ein unkodierter Schrägstrich die Authority — der
Parser interpretierte den Host als leer bzw. griff auf einen Default zurück und landete bei
`localhost`. Nichts hörte dort auf 5432.

Fix: das Passwort im Connection-String Prozent-kodieren (`/` → `%2F`). Kein Neu-Setzen von
Credentials nötig, nur ein sauber kodierter String.

**Lektion 1:** Wenn TCP steht, aber die App „connection refused" meldet, ist nicht das Netz
schuld, sondern wie die App die Verbindungsdaten _interpretiert_. Und Passwort-Generatoren, die
URL-Sonderzeichen ausspucken, sind eine Bug-Quelle, die man nur einmal im Leben debuggen will.

## HTTP-01 war die falsche Challenge

Traefik holte seine Zertifikate per HTTP-01 — pro Hostname eine eigene Challenge über Port 80.
Das ist unpraktisch, wenn die Dienste noch gar nicht öffentlich zeigen (der Umzug lief ja
parallel zum Altbestand) und man ohnehin ein Wildcard will. Also den bestehenden
`letsencrypt`-Resolver von HTTP-01 auf **DNS-01 über Cloudflare** umgestellt — mit demselben
API-Token, das auch mein Caddy schon für die Wildcard nutzte.

Der Clou: Weil ich den Resolver-Namen behielt, zogen automatisch _alle_ Router mit — die
bestehenden wie die künftig von Pangolin generierten. Nach einem kurzen Test gegen die
Staging-CA (gegen Rate-Limits) stand ein gültiges Wildcard-Zertifikat für `*.vugas.de`. DNS-01
validiert über einen TXT-Record und ist damit völlig unabhängig davon, ob der Dienst schon
erreichbar ist — genau richtig für einen Umzug im laufenden Betrieb.

## Der Ausfall, den ich selbst verursacht habe

Jetzt der unangenehme Teil. Damit Pangolin im LAN erreichbar wird, musste AdGuard einen
DNS-Rewrite bekommen. Ich fügte den Eintrag ein, startete AdGuard neu — und \*\*das halbe Netz
verlor DNS\*\*. `:53` band nicht mehr. `systemctl` meldete den Dienst als `active`, der Prozess
war da, das Log endete stumm nach „starting https server", und nichts lauschte auf Port 53.

Ich verrannte mich gründlich: Config-YAML verdächtigt, `bind_hosts` geprüft, IPv6
ausgeschlossen, nach Port-Konflikten gesucht, sogar das Backup zurückgespielt und den Container
rebootet. Nichts half. Der eigentliche Befund stand die ganze Zeit einen `journalctl | grep`
entfernt:

```plain
AdGuardHome.service: Main process exited, code=killed, status=9/KILL
AdGuardHome.service: Failed with result 'oom-kill'.
```

**Out of memory.** Der AdGuard-Container hatte ein 512-MB-Limit und lief chronisch bei \~508 MB
knapp darunter. Mein Neustart löste einen Filter-Reload-Spike aus, der das Limit riss — der
OOM-Killer schlug genau _beim DNS-Bind_ zu, systemd startete neu, das Spiel wiederholte sich.
Ein perfekter Crash-Loop, der so aussah, als hätte ich die Konfiguration zerschossen. Hatte ich
aber nicht — mein Edit war völlig in Ordnung, der Zeitpunkt war nur unglücklich.

Fix in einer Zeile: Limit von 512 auf 1024 MB angehoben (der Host hatte reichlich frei), DNS war
sofort zurück. Nebenbei ein zweiter Stolperstein gelernt: Manuell in AdGuards YAML eingefügte
Rewrites brauchen ein explizites `enabled: true`, sonst normalisiert AdGuard sie beim nächsten
Start auf `false` — inaktiv.

**Lektion 2:** „Dienst active, aber Port bindet nicht, Prozess idle" heißt: **zuerst**
`journalctl | grep -i oom` — bevor man die halbe Nacht die Konfiguration verdächtigt. Und ein
chronisch am RAM-Limit laufender Dienst ist eine tickende Zeitbombe, die beim nächsten Neustart
hochgeht, nicht davor. Das ist verwandt mit dem [AdGuard-DNS-Rätsel](/blog/youtube-aussetzer-adguard)
von neulich — DNS ist die Schicht, deren Fehler am unschuldigsten aussehen und am meisten
Kollateralschaden anrichten.

## Die API, die es offiziell nicht gab

Für \~20 Dienste wollte ich die Ressourcen nicht von Hand klicken, sondern skripten. Pangolin
hat eine Integrations-API, ich hatte einen gültigen API-Key — und bekam auf _jeden_
authentifizierten Endpoint ein `401 Unauthorized`. Der Key stimmte (die letzten Zeichen
matchten den DB-Eintrag, `isRoot`, alle Rechte), das Format stimmte, der Header stimmte.

Ein `grep` durch das App-Bundle im Container brachte zwei Hinweise: einen Schalter namens
`enable_integration_api` und einen separaten `integrationApiServer`. Die Integrations-API war
schlicht **standardmäßig aus**. Nach `enable_integration_api: true` und einem Neustart tauchte
im Log eine neue Zeile auf:

```plain
Integration API server is running on http://localhost:3003
```

Die API lief auf einem **eigenen Port** (`:3003`) und unter einem anderen Pfad (`/v1`, nicht
`/api/v1`) — und wird bewusst _nicht_ über Traefik nach außen geroutet. Von innen war sie über
`docker exec` sofort ansprechbar. Danach war der Rest Fließband: ein kleines Skript, das pro
Dienst eine Ressource und ein Target anlegt und die Auth-Klasse setzt. Siebzehn Dienste in einem
Durchlauf.

**Lektion 3:** Ein `401` heißt nicht immer „falscher Key". Es kann auch heißen „das Feature, das
diesen Endpoint bedient, läuft gar nicht". Der Blick ins ausgelieferte Bundle ist manchmal
schneller als jede Doku.

## Zwei OIDC-Fallen zum Schluss

Als das Gerüst stand, blieben zwei klassische SSO-Stolpersteine:

**„The request is otherwise malformed".** Der Login über Authentik brach mit dieser wenig
hilfreichen OAuth2-Meldung ab. Authentiks Log war präziser: `Invalid grant_type for provider`.
Ich hatte den OAuth2-Provider per Skript (ORM) angelegt und dabei ein Feld übersehen, das die
Weboberfläche automatisch füllt: die erlaubten `grant_types`. Leere Liste → kein
`authorization_code` → „malformed". Ein Wert gesetzt, fertig.

**Das zirkuläre Gate.** Damit der Browser Authentik überhaupt erreicht, machte ich Authentik zu
einer Pangolin-Ressource. Nur schützte Pangolin sie prompt mit seiner _eigenen_ SSO-Wall — die
wiederum Authentik braucht. Ein perfekter Kreis: Um dich bei Authentik anzumelden, musst du dich
erst bei Authentik anmelden. Die Ressource, die _den_ Login trägt, muss selbst öffentlich sein.
Ein Flag umgelegt, Kreis durchbrochen.

## Der Cutover

Mit allem Verdrahteten kam der scharfe Teil — bewusst in Etappen, mit dem alten Caddy als
sofortigem Rückfallnetz:

1. **LAN zuerst:** AdGuards Rewrites für die migrierten Hosts auf Pangolin umgelegt, im Heimnetz
   jeden Dienst durchgetestet.
2. **Extern:** Den WAN-Port-Forward in der OPNsense von Caddy auf Pangolin umgebogen — nach der
   bewährten Methode aus dem [Firewall-Audit](/blog/firewall-audit-zero-trust): `config.xml`-Edit,
   `configctl filter reload`, und im Live-`pfctl` gegengeprüft, dass die Regel wirklich greift.
3. **DNS:** Und hier noch eine Überraschung. Der Wildcard `*.vugas.de` war gar kein A-Record,
   sondern ein CNAME auf den Dedicated. Also auf einen A-Record mit meiner Heim-IP umgestellt.
   Prompt zeigten `sonarr` & Co. trotzdem noch auf den alten Server: Sie hatten **eigene,**
\*\*   spezifische\*\* Records, die den Wildcard überschrieben. Die mussten einzeln mit.

Weil meine Heim-IP dynamisch ist, war der letzte Schliff, den DDNS-Updater zu erweitern: Er
pflegt jetzt neben den Einzel-Hosts auch den Wildcard-Record (mit `set -f`, sonst expandiert die
Shell das `*` als Glob — noch so eine Kleinigkeit, die man einmal sieht und nie vergisst).

Danach ein voller Testdurchlauf, extern über Mobilfunk: Alle Dienste erreichbar, gültige
Zertifikate, SSO-Login sauber, **kein Timeout mehr**. Genau der Beweis, um den es die ganze Zeit
ging. Zum Abschluss den Caddy-Dienst gestoppt (der Container läuft nur noch für DDNS weiter) und
die toten DNS-Records aufgeräumt.

## Der Nachschlag: ein Bug, der erst am nächsten Tag zuschlug

Ich hätte schwören können, es sei fertig. Doch am Tag nach dem Cutover die Nachricht: `jelly.vugas.de`
sei vom Handy aus nicht erreichbar — mein Bruder bestätigte es. Aus dem Heimnetz lief alles, extern
tot. Und das Verwirrendste: **mal** ging es, **mal** nicht.

DNS? Zeigte korrekt auf die Heim-IP. Firewall-Regel? Im Live-`pfctl` sauber auf Pangolin. Pangolin?
Lief, lieferte intern brav sein `302`. Ich grub mich also durch den Netz-Stack — mit `tcpdump` am
WAN-Interface, während mein Bruder und ich abwechselnd vom Handy triggerten. (Kleine Stolperfalle:
ein per SSH im Hintergrund gestarteter `tcpdump` stirbt an SIGHUP, sobald die Session schließt — man
muss ihn im Vordergrund laufen lassen.)

Der Mitschnitt legte Schicht für Schicht frei: Das SYN kam am WAN an. Ein SYN-ACK ging zurück — der
TCP-Handshake wurde also beantwortet. Die MTU war sauber (MSS auf 1452 geclamped, keine
Blackhole-Gefahr). Ein vollständiger Mitschnitt zeigte dann das eigentliche Bild: **TLS-Handshake
komplett, Zertifikat gültig — und dann sendet der Browser einfach keinen HTTP-Request und macht nach
10 Sekunden zu.** Kein Reset, kein Fehler, keine Log-Zeile in Traefik. Ein Gespenst.

Die entscheidende Beobachtung war ein Vergleich: `vugas.de` — meine öffentliche Startseite, die über
einen eigenen Traefik-Router *ohne* die SSO-Middleware läuft — funktionierte zuverlässig. Die gateten
Dienste dahinter nicht, und `jelly` ging „mal ja, mal nein". Intermittenz plus „ein Dienst geht, der
andere nicht" riecht fast immer nach **Protokoll-Racing**.

Des Rätsels Lösung: Traefik bewarb auf jeder Antwort **HTTP/3** — `Alt-Svc: h3=":443"; ma=2592000`.
Der Browser merkt sich das (30 Tage!) und versucht beim nächsten Besuch QUIC über **UDP** 443. Meine
OPNsense forwarded aber nur **TCP** 443 auf Pangolin, kein UDP. Also lief jeder HTTP/3-Versuch ins
Leere; je nach Browser-Laune hing die Verbindung im UDP-Blackhole oder fiel — verzögert und
unzuverlässig — auf TCP zurück. Genau das „mal so, mal so".

Der Fix war eine Zeile: die HTTP/3-Werbung in Traefik abschalten. Kein `Alt-Svc` mehr, alles läuft
über das solide h2/TCP. (Wer HTTP/3 wirklich will, müsste zusätzlich UDP 443 forwarden.)

**Lektion 5:** „Handshake komplett, aber kein Request" ist die Signatur eines Problems *oberhalb* des
TCP-Layers — und `curl -k` verrät es dir nie, weil es weder HTTP/3 spricht noch das Zertifikat prüft.
Ein Reverse Proxy, der ein Protokoll bewirbt, das die Firewall gar nicht durchlässt, ist eine
subtile, gemeine Falle. Sichtbar wurde sie erst im Paket-Mitschnitt auf beiden Seiten.

## Was ich mitnehme

Vier Dinge bleiben hängen. Erstens: **Installer sind Software, und Software hat Bugs** — ein
generiertes Passwort mit Schrägstrich hat mich eine Stunde gekostet, obwohl „nichts" falsch
konfiguriert war. Zweitens: Der gefährlichste Ausfall ist der, den man selbst auslöst, während
man etwas Harmloses tut; der OOM-Kill hatte mit meinem Edit nichts zu tun, nur mit seinem
Zeitpunkt. Drittens: Zwischen „geplant" und „läuft" liegen bei so einem Umzug ein halbes Dutzend
undokumentierter Kleinigkeiten — eine deaktivierte API, ein fehlendes Feld, ein CNAME statt
A-Record, ein Glob im falschen Moment, ein beworbenes Protokoll, das die Firewall gar nicht
durchlässt. Und viertens: Eine KI am Terminal macht so ein Projekt
drastisch schneller — aber nur, weil ich jeden Befund selbst gegengeprüft habe, statt dem ersten
grünen Häkchen zu glauben.

Am Ende steht, was ich wollte: ein einziger Edge, ein Login, keine Abhängigkeit von fremder
Infrastruktur — und ein Mobilfunk-Zugriff, der einfach funktioniert.
