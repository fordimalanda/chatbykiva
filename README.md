# KivaSocial — Vitrine Technologique & Démonstration de KivaDB

> **KivaSocial** est un projet démonstrateur complet (Proof of Concept fullstack) conçu pour mettre en valeur les capacités, la rapidité et la flexibilité de **KivaDB (v1.0.0)** — une base de données NoSQL moderne alliant stockage clé-valeur, documents JSON structurés et notifications temps réel natives.

Ce projet démontre comment concevoir une application interactive moderne (réseau social avec authentification, système de suivi mutuel et messagerie instantanée) **en s'appuyant exclusivement sur KivaDB pour toute la persistance et les flux d'événements**, sans avoir besoin d'un moteur SQL lourd ni de briques additionnelles comme Redis.

---

## Pourquoi ce projet ? Ce que KivaDB apporte

Ce projet illustre 4 points forts majeurs de KivaDB :

1. **Modélisation NoSQL Clé-Valeur & Documents JSON** :
   - Stockage simple et expressif des utilisateurs sous `user:<username>` avec des tableaux JSON (`followers`, `following`) manipulés dynamiquement.
   - Stockage des messages sous `msg:<id>` sans schéma rigide ni migration contraignante.

2. **Isolation par Workspaces (`social_app`)** :
   - Démonstration de la gestion multi-environnements de KivaDB. L'ensemble des données du réseau social est confiné dans un workspace isolé nommé `social_app`.

3. **Temps Réel Natif sans Redis (`/ws`)** :
   - KivaDB intègre nativement un système d'abonnement aux mutations (`subscribe` / endpoint WebSocket `ws://localhost:8080/ws`).
   - Chaque fois qu'une clé change (`set`, `update`), KivaDB émet un événement qui alimente instantanément la messagerie et les compteurs de followers des clients connectés.

4. **Double Accès Réseau Hybride** :
   - Accès fluide en **HTTP/REST** (port `8080`) pour les opérations de lecture/écriture rapides.
   - Accès via protocole binaire **TCP** (port `2911`) pour les flux à haute performance.

---

## Stack Technique

- **Base de Données** : KivaDB 1.0.0 (Workspace dédié `social_app`, ports 8080 et 2911)
- **Backend** : NestJS (TypeScript, WebSocket Gateway Socket.IO, Bcrypt)
- **Frontend** : Next.js 15 (App Router, React 19, TypeScript)
- **UI & Style** : TailwindCSS, Lucide Icons, Design System inspiré de ShadcnUI (Dark theme épuré)

---

## Fonctionnalités Implémentées

| Fonctionnalité | Rôle dans l'application | Intégration KivaDB |
| :--- | :--- | :--- |
| **Authentification** | Inscription & Connexion sécurisée | Sauvegarde sous `user:<username>` avec hachage sécurisé bcrypt. |
| **Exploration Communautaire** | Liste de tous les membres inscrits avec recherche | Scan KivaDB `range('user:', 'user:~')` ou `scan('user:*')`. |
| **Follow / Unfollow en direct** | Suivre ou se désabonner d'autres profils | Mise à jour atomique des listes JSON `followers` et `following` dans KivaDB. |
| **Compteurs Dynamiques** | Affichage du nombre d'abonnés et d'abonnements | Actualisation instantanée via les événements WebSocket de KivaDB. |
| **Messagerie Instantanée** | Chat public (Salon Général) et privé (Direct) | Enregistrement sous `msg:<timestamp>_<id>` et propagation temps réel. |
| **Inspecteur KivaDB (Live Ticker)** | Bandeau en direct affichant les mutations de la base | Écoute en continu du flux `/ws` de KivaDB avec type et nom de clé. |
| **Visualiseur JSON KivaDB** | Onglet dédié sur chaque profil | Affichage du document JSON brut tel que stocké dans KivaDB. |

---

## Arborescence du Projet

```text
chatbykiva/
├── README.md                  # Présentation du projet démonstrateur
├── .gitignore                 # Fichiers exclus du versionnement
├── package.json               # Commandes globales du monorepo
├── start-all.bat              # Script de démarrage global en 1 clic (PC + Mobile)
├── start-backend.bat          # Démarrage rapide du Backend seul
├── start-frontend.bat         # Démarrage rapide du Frontend seul
│
├── backend/                   # Backend NestJS (Port 4000)
│   ├── src/
│   │   ├── main.ts            # Démarrage, écoute sur 0.0.0.0 et CORS
│   │   ├── app.module.ts      # Assemblage des modules
│   │   ├── kiva/              # KivaService : pont REST, TCP & WebSocket KivaDB
│   │   ├── auth/              # Contrôleur & Service d'authentification
│   │   ├── users/             # Gestion de la communauté et du Follow/Unfollow
│   │   ├── messages/          # Persistance et requêtes des messages de chat
│   │   └── events/            # Passerelle temps réel relayant les flux KivaDB
│   ├── package.json
│   └── tsconfig.json
│
└── frontend/                  # Application Next.js (Port 3000)
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx     # Layout global (Navbar + Contexts)
    │   │   ├── globals.css    # Thème sombre moderne, gradients, variables CSS
    │   │   ├── page.tsx       # Landing page de présentation
    │   │   ├── login/         # Page de connexion
    │   │   ├── register/      # Page d'inscription utilisateur
    │   │   ├── feed/          # Fil d'actualité et publication de posts
    │   │   ├── friends/       # Annuaire des membres & Follow en direct
    │   │   ├── profile/[username]/ # Profil utilisateur & Document JSON KivaDB
    │   │   └── messages/      # Interface de messagerie instantanée
    │   ├── components/        # Composants UI (Navbar, Cards, Ticker KivaDB...)
    │   ├── context/           # AuthContext & SocketContext (connexion live)
    │   └── lib/               # Client API avec détection d'hôte automatique
    ├── package.json
    ├── next.config.ts
    └── tailwind.config.ts
```

---

## Démarrage Rapide

### Prérequis
Assurez-vous que votre base KivaDB est active :
```bash
kivadb start
kivadb status
```

---

### Option 1 : Lancement en 1 clic (Recommandé)
Double-cliquez sur le fichier :
**`start-all.bat`**

Deux fenêtres de terminal s'ouvriront pour lancer simultanément le backend et le frontend.

---

### Option 2 : Lancement manuel via terminal

**1. Lancer le Backend NestJS (Port 4000) :**
```bash
cd backend
npm run start:dev
```

**2. Lancer le Frontend Next.js (Port 3000) :**
```bash
cd frontend
npm run dev
```

---

## Accès depuis un Smartphone (Réseau Local Wi-Fi)

Le projet est préconfiguré pour être testé simultanément depuis votre PC et depuis un smartphone connecté au même réseau Wi-Fi :

1. Sur votre **PC** : ouvrez http://localhost:3000.
2. Sur votre **Smartphone** : ouvrez l'adresse IP locale de votre machine sur le port 3000 :
   ```text
   http://<VOTRE_IP_LOCALE>:3000   (ex: http://192.168.1.68:3000)
   ```
3. Créez un compte différent sur chaque appareil (ex: alice sur PC et bob sur smartphone).
4. Suivez-vous mutuellement et envoyez-vous des messages : vous verrez les compteurs et les messages s'actualiser **instantanément sur les deux écrans** grâce aux WebSockets de KivaDB.
