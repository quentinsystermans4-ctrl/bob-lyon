# Protocole de Mise à Jour de l'Agenda BOB

Ce document formalise les règles de mise à jour automatique de l'agenda de la semaine dans `assets/data/agenda.json`.

---

## 1. Fonctionnement
Il vous suffit d'écrire en langage naturel les quelques rendez-vous clés prévus pour la semaine (ex: *« Cette semaine : Jeudi Quiz #3, Vendredi match OL-OM à 20h45 »*).

L'assistant s'occupe automatiquement de :
1. Déterminer les dates exactes de la semaine (du Lundi au Samedi).
2. Insérer vos événements spécifiques aux jours et heures indiqués.
3. Compléter automatiquement les jours creux avec les rendez-vous génériques et conviviaux du bar.
4. Mettre à jour `assets/data/agenda.json`.
5. Générer la légende Instagram prête à coller dans `storyTemplate.caption`.
6. Mettre à jour l'aperçu Story 9:16 PNG dans `agenda-bob.html`.
7. Pousser la mise à jour sur GitHub Pages.

---

## 2. Catalogue des Événements Génériques par Défaut

| Jour | Horaires | Événement générique par défaut |
| :--- | :--- | :--- |
| **Lundi** | 17h00 — 23h00 | **Le Lundi au BOB & Fléchettes**<br>Cible de fléchettes en libre accès gratuit, jeux de société & Happy Hour 17h-20h. |
| **Mardi** | 17h00 — 01h00 | **Afterwork des Pentes & Pressions Locales**<br>Dégustation de nos 9 bières pression artisanales & planches à partager en Happy Hour. |
| **Mercredi** | 17h00 — 01h00 | **Fléchettes, Jeux & Dégustation**<br>Soirée détente entre potes, tournois de cartes & bières de saison. |
| **Jeudi** | 20h30 — 01h00 | **Soirée Animée / Quiz du BOB** (ou Bière du moment si pas de quiz)<br>Culture G, blind-tests et ambiance conviviale. |
| **Vendredi** | 20h45 — 01h00 | **Grand Écran / Soirée Planches & Pizzas**<br>Choc sportif ou ambiance festive du week-end aux Pentes. |
| **Samedi** | 16h00 — 01h00 | **17h00 : Tournoi d'Échecs (<1000 ELO) avec @chessbar_lyon**<br>Tournoi débutants/loisirs en accès libre, suivi des retransmissions sportives. |
| **Dimanche** | — | **Fermé** |

---

## 3. Structure d'un Événement dans `agenda.json`
```json
{
  "id": "event-1",
  "day": "Lundi 14/09",
  "dayName": "Lundi",
  "time": "17h00 - 23h00",
  "category": "jeux",
  "categoryLabel": "Opening & Jeux",
  "categoryIcon": "fa-solid fa-bullseye",
  "badge": "En libre accès",
  "title": "Le Lundi au BOB & Fléchettes",
  "description": "Cible de fléchettes en libre accès, jeux de société et dégustation de nos 9 pressions en Happy Hour (17h-20h)."
}
```
