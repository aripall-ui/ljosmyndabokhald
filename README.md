# Ljósmyndabókhald

Einfalt utanumhald fyrir ljósmyndarekstur: gigg, reikningar, kostnaður, innkaup og gögn fyrir bókara.

- Engin uppsetning á netþjóni – appið er ein vefsíða (HTML/JS) sem keyrir í vafranum.
- Gögn og fylgiskjöl eru vistuð í **Dropbox** (mappan `Dropbox/Apps/<nafn appsins>/`), eða í vafranum til prófunar.
- Appið hefur aðeins aðgang að sinni eigin möppu í Dropbox – ekki að myndunum þínum.

## Uppsetning (einu sinni)

### 1. Birta appið á GitHub Pages
1. Í GitHub: **Settings → Pages**.
2. Undir *Build and deployment*: Source = **Deploy from a branch**, Branch = **main**, mappa **/ (root)** → **Save**.
3. Eftir 1–2 mínútur birtist slóðin, t.d. `https://<notandi>.github.io/<repo>/`.

### 2. Búa til Dropbox-app
1. Farðu á <https://www.dropbox.com/developers/apps> og smelltu **Create app**.
2. Veldu **Scoped access** → **App folder** → gefðu nafn (t.d. `Ljosmyndabokhald-<nafn>`).
3. Í flipanum **Permissions** hakaðu við: `files.content.write`, `files.content.read` (og `files.metadata.read`) → **Submit**.
4. Í flipanum **Settings**:
   - Undir **OAuth 2 → Redirect URIs** bættu við slóðinni úr skrefi 1 (nákvæmlega, með `/` í lokin) → **Add**.
   - Afritaðu **App key**.
5. Settu App key í `config.js` (eða límdu hann inn í appið við fyrstu innskráningu).

### 3. Opna í síma
Opnaðu slóðina í Safari/Chrome → **Deila → Bæta við heimaskjá**. Skráðu þig inn með Dropbox einu sinni á hverju tæki.

## Hvernig tölur eru reiknaðar
- **Tekjur** = reikningar merktir *Sent* eða *Greitt*, eftir dagsetningu reiknings (án VSK).
- **Útskattur** fylgir dagsetningu reiknings; **greiðslur** fylgja greiðsludegi.
- **Útistandandi** = allir sendir, ógreiddir reikningar – óháð ári.
- **Ósent** = skráðir ósendir reikningar + gigg með samið verð sem enginn reikningur er kominn á.
- Pro bono, greiðar og gigg sem hætt var við teljast ekki til tekna.
- **Kostnaður** = greitt verð að frádregnum frádráttarbærum innskatti.
- Innkaupahugmyndir teljast ekki til kostnaðar fyrr en þær eru merktar *Keypt* (þá verður til kostnaðarfærsla).

## Afrit
Dropbox geymir eldri útgáfur af `data.json` sjálfkrafa. Einnig má sækja afrit í **Stillingar → Afrit**.

## Tæknilegt
Preact + htm og JSZip eru í `vendor/` – ekkert build-skref. Til að keyra staðbundið: `python3 -m http.server` og opna `http://localhost:8000/`.

## Útgáfur
Keyrðu `python3 tools/version.py` áður en breytingar eru sendar. Það stimplar `index.html` svo vafrar sæki alltaf nýjustu skrárnar.
