# ADR-0002 — Pas d’authentification applicative

## Contexte

Le modèle de menace local conserve trois vecteurs : CSRF depuis un autre onglet, DNS rebinding et exposition LAN accidentelle.

## Décision

L’OS est la frontière d’accès ; Jira Lite n’ajoute pas de login. Les écritures sont protégées par CSRF, les hôtes par `trusted_hosts` et le service par le bind loopback.

## Alternatives

- Form login `InMemoryUser` : rejeté, car il augmente la gestion de secrets sans isoler des utilisateurs locaux.
- OAuth Atlassian 3LO : rejeté, car il change le produit vers une application multi-utilisateur.

## Conséquences

Une seule identité Jira est utilisée par l’application.

## Déclencheurs de réévaluation

Exposition hors loopback, poste partagé, périmètres Jira distincts ou besoin d’attribution individuelle des actions.
