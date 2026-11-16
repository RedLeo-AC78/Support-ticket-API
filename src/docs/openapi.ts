// Contrat OpenAPI servi par GET /openapi.json. Aucun secret dans les exemples.
export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Support Ticket API",
    version: "1.1.0",
    description:
      "API pédagogique. Limite globale 300 requêtes/IP/minute, compteurs mémoire pour une instance. Autorisation Bearer JWT, renouvellement via refresh token. Les ressources sont des objets JSON, toutes les collections sont data/meta. Erreurs communes error/code/status. HTTPS requis hors localhost.",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Développement local",
    },
  ],
  security: [
    {
      bearerAuth: [],
    },
  ],
  paths: {
    "/auth/login": {
      post: {
        summary: "Connexion email / mot de passe",
        description:
          "30 requêtes/IP/15 min partagées avec refresh/logout, 10/email/15 min. JWT 15 min maximum, session 7 jours maximum.",
        tags: ["auth"],
        operationId: "postauthlogin",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                  },
                  password: {
                    type: "string",
                    minLength: 15,
                    maxLength: 128,
                    writeOnly: true,
                  },
                },
                required: ["email", "password"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Tokens",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/auth/refresh": {
      post: {
        summary: "Rotation des deux tokens",
        description:
          "Chaque refresh token est utilisable une fois. Sa réutilisation révoque toute la session.",
        tags: ["auth"],
        operationId: "postauthrefresh",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  refreshToken: {
                    type: "string",
                    pattern: "^[A-Za-z0-9_-]{43}$",
                    writeOnly: true,
                  },
                },
                required: ["refreshToken"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Tokens",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/auth/logout": {
      post: {
        summary: "Révocation de la session",
        description:
          "Logout idempotent : token inconnu correctement formé accepté.",
        tags: ["auth"],
        operationId: "postauthlogout",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  refreshToken: {
                    type: "string",
                    pattern: "^[A-Za-z0-9_-]{43}$",
                    writeOnly: true,
                  },
                },
                required: ["refreshToken"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "204": {
            description: "Succès, aucun corps.",
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/auth/me": {
      get: {
        summary: "Compte actuellement connecté",
        description: "Compte actuellement connecté",
        tags: ["auth"],
        operationId: "getauthme",
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/User",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/auth/accept-invitation": {
      post: {
        summary: "Accepter une invitation à usage unique",
        description: "Accepter une invitation à usage unique",
        tags: ["auth"],
        operationId: "postauthacceptinvitation",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  token: {
                    type: "string",
                    pattern: "^[A-Za-z0-9_-]{43}$",
                    writeOnly: true,
                  },
                  password: {
                    type: "string",
                    minLength: 15,
                    maxLength: 128,
                    writeOnly: true,
                  },
                  confirmPassword: {
                    type: "string",
                    minLength: 15,
                    maxLength: 128,
                    writeOnly: true,
                  },
                },
                required: ["token", "password", "confirmPassword"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserResult",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/auth/forgot-password": {
      post: {
        summary: "Demander un email de réinitialisation",
        description:
          "Réponse identique pour compte absent, invité ou désactivé. Code valable 20 minutes, 3 demandes/email/heure et 20/IP/15 min.",
        tags: ["auth"],
        operationId: "postauthforgotpassword",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                  },
                },
                required: ["email"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "202": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Message",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/auth/reset-password": {
      post: {
        summary: "Changer le mot de passe et révoquer les sessions",
        description: "Changer le mot de passe et révoquer les sessions",
        tags: ["auth"],
        operationId: "postauthresetpassword",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  token: {
                    type: "string",
                    pattern: "^[A-Za-z0-9_-]{43}$",
                    writeOnly: true,
                  },
                  newPassword: {
                    type: "string",
                    minLength: 15,
                    maxLength: 128,
                    writeOnly: true,
                  },
                  confirmPassword: {
                    type: "string",
                    minLength: 15,
                    maxLength: 128,
                    writeOnly: true,
                  },
                },
                required: ["token", "newPassword", "confirmPassword"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Message",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/users": {
      get: {
        summary: "Liste des comptes (ADMIN, SUPER_ADMIN)",
        description: "Liste des comptes (ADMIN, SUPER_ADMIN)",
        tags: ["users"],
        operationId: "getusers",
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserPage",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
        parameters: [
          {
            name: "page",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100000,
              default: 1,
            },
          },
          {
            name: "limit",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
            },
          },
        ],
      },
      post: {
        summary: "Inviter un compte (SUPER_ADMIN)",
        description:
          "Rôle USER par défaut. Code valable 24 h. accepted signifie accepté par le fournisseur, pas forcément livré.",
        tags: ["users"],
        operationId: "postusers",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: {
                    type: "string",
                    format: "email",
                  },
                  role: {
                    type: "string",
                    enum: ["USER", "AGENT", "ADMIN", "SUPER_ADMIN"],
                  },
                },
                required: ["email"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Invitation",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/users/{id}/invitation": {
      post: {
        summary: "Renvoyer une invitation (SUPER_ADMIN)",
        description: "Renvoyer une invitation (SUPER_ADMIN)",
        tags: ["users"],
        operationId: "postusersidinvitation",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 2147483647,
            },
          },
        ],
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Invitation",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/users/{id}/status": {
      patch: {
        summary: "Désactiver ou réactiver (SUPER_ADMIN)",
        description:
          "Sessions révoquées et codes supprimés. Dernier Super Admin actif protégé. Compte sans mot de passe réactivé en INVITED.",
        tags: ["users"],
        operationId: "patchusersidstatus",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 2147483647,
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: {
                    type: "string",
                    enum: ["ACTIVE", "DISABLED"],
                  },
                },
                required: ["status"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserResult",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/users/{id}/role": {
      patch: {
        summary: "Changer un rôle (SUPER_ADMIN)",
        description:
          "Sessions et codes révoqués. Dernier Super Admin actif protégé. Action auditée dans la même transaction.",
        tags: ["users"],
        operationId: "patchusersidrole",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 2147483647,
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  role: {
                    type: "string",
                    enum: ["USER", "AGENT", "ADMIN", "SUPER_ADMIN"],
                  },
                },
                required: ["role"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UserResult",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/users/audit-logs": {
      get: {
        summary: "Journal paginé (SUPER_ADMIN)",
        description: "Journal paginé (SUPER_ADMIN)",
        tags: ["users"],
        operationId: "getusersauditlogs",
        parameters: [
          {
            name: "page",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100000,
              default: 1,
            },
          },
          {
            name: "limit",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
            },
          },
        ],
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuditPage",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/tickets": {
      post: {
        summary: "Créer son ticket (tout compte actif)",
        description:
          "Titre et description non vides après trim. Seuls ces champs sont utilisés : ownerId est imposé par le serveur, statut initial OPEN. Si AI_ENABLED=true, classement et réponse proposée automatiquement (attente fournisseur maximale 20 secondes). Une panne IA conserve le ticket. Pas de résolution sans confirmation du propriétaire. 30 créations/IP/heure.",
        tags: ["tickets"],
        operationId: "posttickets",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: {
                    type: "string",
                    minLength: 1,
                    maxLength: 150,
                  },
                  description: {
                    type: "string",
                    minLength: 1,
                    maxLength: 5000,
                  },
                },
                required: ["title", "description"],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Ticket",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
      get: {
        summary: "Lister ses tickets autorisés",
        description:
          "USER : propres tickets ; AGENT : tickets avec propriétaire ; ADMIN/SUPER_ADMIN : tous. Recherche insensible à la casse sur titre/description (motifs SQL LIKE % et _ supportés). Tri secondaire par id. Compteur calculé dans le même périmètre et snapshot que les résultats. Paramètres inconnus ou répétés refusés.",
        tags: ["tickets"],
        operationId: "gettickets",
        parameters: [
          {
            name: "page",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100000,
              default: 1,
            },
          },
          {
            name: "limit",
            in: "query",
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 100,
              default: 20,
            },
          },
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
            },
          },
          {
            name: "search",
            in: "query",
            schema: {
              type: "string",
              minLength: 1,
              maxLength: 150,
            },
          },
          {
            name: "sortBy",
            in: "query",
            schema: {
              type: "string",
              enum: ["id", "createdAt", "updatedAt", "title", "status"],
              default: "id",
            },
          },
          {
            name: "order",
            in: "query",
            schema: {
              type: "string",
              enum: ["asc", "desc"],
              default: "desc",
            },
          },
          {
            name: "aiState",
            in: "query",
            schema: {
              type: "string",
              enum: [
                "PROCESSING",
                "ANSWERED",
                "OFF_TOPIC",
                "NEEDS_REVIEW",
                "FAILED",
                "CONFIRMED",
              ],
            },
          },
        ],
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/TicketPage",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/tickets/{id}": {
      get: {
        summary: "Lire un ticket autorisé",
        description: "Lire un ticket autorisé",
        tags: ["tickets"],
        operationId: "getticketsid",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 2147483647,
            },
          },
        ],
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Ticket",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/tickets/{id}/status": {
      patch: {
        summary: "Modifier le statut (AGENT, ADMIN, SUPER_ADMIN)",
        description: "Modifier le statut (AGENT, ADMIN, SUPER_ADMIN)",
        tags: ["tickets"],
        operationId: "patchticketsidstatus",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 2147483647,
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  status: {
                    type: "string",
                    enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
                  },
                },
                required: ["status"],
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Succès",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Ticket",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "413": {
            $ref: "#/components/responses/Error413",
          },
          "415": {
            $ref: "#/components/responses/Error415",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/tickets/{id}/ai/retry": {
      post: {
        tags: ["tickets"],
        operationId: "retryTicketAi",
        summary:
          "Relancer une analyse absente ou en échec (AGENT, ADMIN, SUPER_ADMIN)",
        description:
          "Même visibilité que les tickets. Maximum 3 tentatives/ticket et 5 requêtes/IP/heure. Une analyse PROCESSING interrompue peut être reprise après 60 secondes. Aucune relance automatique. 503 si IA désactivée. Le ticket doit être OPEN ou IN_PROGRESS.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 2147483647,
            },
          },
        ],
        responses: {
          "200": {
            description: "Ticket et état IA",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Ticket",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
    "/tickets/{id}/ai/feedback": {
      post: {
        tags: ["tickets"],
        operationId: "ticketAiFeedback",
        summary:
          "Confirmer ou refuser la solution IA (propriétaire uniquement)",
        description:
          "Uniquement pour une proposition ANSWERED correspondant à la version actuelle du ticket. true passe en RESOLVED/CONFIRMED ; false passe en IN_PROGRESS/NEEDS_REVIEW. 30 requêtes/IP/heure. Répétition ou conflit : 409. Le classement hors sujet ne supprime ni ne ferme un ticket.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: {
              type: "integer",
              minimum: 1,
              maximum: 2147483647,
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["resolved"],
                properties: {
                  resolved: {
                    type: "boolean",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Ticket et état IA",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/Ticket",
                },
              },
            },
          },
          "400": {
            $ref: "#/components/responses/Error400",
          },
          "401": {
            $ref: "#/components/responses/Error401",
          },
          "403": {
            $ref: "#/components/responses/Error403",
          },
          "404": {
            $ref: "#/components/responses/Error404",
          },
          "409": {
            $ref: "#/components/responses/Error409",
          },
          "429": {
            $ref: "#/components/responses/Error429",
          },
          "500": {
            $ref: "#/components/responses/Error500",
          },
          "503": {
            $ref: "#/components/responses/Error503",
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "string",
          },
          code: {
            type: "string",
          },
          status: {
            type: "integer",
          },
        },
        required: ["error", "code", "status"],
      },
      Message: {
        type: "object",
        properties: {
          message: {
            type: "string",
          },
        },
        required: ["message"],
      },
      User: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            minimum: 1,
          },
          email: {
            type: "string",
            format: "email",
          },
          role: {
            type: "string",
            enum: ["USER", "AGENT", "ADMIN", "SUPER_ADMIN"],
          },
          status: {
            type: "string",
            enum: ["INVITED", "ACTIVE", "DISABLED"],
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
        },
        required: ["id", "email", "role", "status", "createdAt"],
      },
      Ticket: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            minimum: 1,
          },
          title: {
            type: "string",
          },
          description: {
            type: "string",
          },
          status: {
            type: "string",
            enum: ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"],
          },
          ownerId: {
            type: "integer",
            minimum: 1,
            nullable: true,
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
          },
          ai: {
            $ref: "#/components/schemas/TicketAi",
          },
          revision: {
            type: "integer",
            minimum: 0,
            description: "Version interne de concurrence.",
          },
        },
        required: [
          "id",
          "title",
          "description",
          "status",
          "ownerId",
          "createdAt",
          "updatedAt",
        ],
      },
      Meta: {
        type: "object",
        properties: {
          page: {
            type: "integer",
            minimum: 1,
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 100,
          },
          total: {
            type: "integer",
            minimum: 0,
          },
          totalPages: {
            type: "integer",
            minimum: 0,
          },
        },
        required: ["page", "limit", "total", "totalPages"],
      },
      TicketPage: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Ticket",
            },
          },
          meta: {
            $ref: "#/components/schemas/Meta",
          },
        },
        required: ["data", "meta"],
      },
      Tokens: {
        type: "object",
        properties: {
          accessToken: {
            type: "string",
          },
          refreshToken: {
            type: "string",
          },
          tokenType: {
            type: "string",
            enum: ["Bearer"],
          },
          expiresIn: {
            type: "integer",
          },
        },
        required: ["accessToken", "refreshToken", "tokenType", "expiresIn"],
      },
      Invitation: {
        type: "object",
        properties: {
          user: {
            $ref: "#/components/schemas/User",
          },
          invitation: {
            type: "object",
            properties: {
              status: {
                type: "string",
                enum: ["local", "accepted", "failed"],
              },
            },
            required: ["status"],
          },
        },
        required: ["user", "invitation"],
      },
      UserResult: {
        type: "object",
        properties: {
          user: {
            $ref: "#/components/schemas/User",
          },
          message: {
            type: "string",
          },
        },
        required: ["user", "message"],
      },
      Audit: {
        type: "object",
        properties: {
          id: {
            type: "integer",
            minimum: 1,
          },
          actorId: {
            type: "integer",
            minimum: 1,
          },
          targetId: {
            type: "integer",
            minimum: 1,
          },
          action: {
            type: "string",
            enum: [
              "USER_ROLE_CHANGED",
              "USER_STATUS_CHANGED",
              "USER_INVITED",
              "INVITATION_REISSUED",
              "INVITATION_ACCEPTED",
              "PASSWORD_RESET",
              "TICKET_AI_REQUESTED",
              "TICKET_AI_COMPLETED",
              "TICKET_AI_CONFIRMED",
              "TICKET_AI_REJECTED",
            ],
          },
          before: {
            type: "string",
            nullable: true,
          },
          after: {
            type: "string",
            nullable: true,
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
          targetType: {
            type: "string",
            enum: ["USER", "TICKET"],
          },
        },
        required: [
          "id",
          "actorId",
          "targetId",
          "action",
          "before",
          "after",
          "createdAt",
        ],
      },
      AuditPage: {
        type: "object",
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/Audit",
            },
          },
          meta: {
            $ref: "#/components/schemas/Meta",
          },
        },
        required: ["data", "meta"],
      },
      UserPage: {
        type: "object",
        required: ["data", "meta"],
        properties: {
          data: {
            type: "array",
            items: {
              $ref: "#/components/schemas/User",
            },
          },
          meta: {
            $ref: "#/components/schemas/Meta",
          },
        },
      },
      TicketAi: {
        type: "object",
        nullable: true,
        required: [
          "state",
          "answer",
          "reason",
          "classification",
          "attempts",
          "provider",
          "model",
          "promptVersion",
        ],
        properties: {
          state: {
            type: "string",
            enum: [
              "PROCESSING",
              "ANSWERED",
              "OFF_TOPIC",
              "NEEDS_REVIEW",
              "FAILED",
              "CONFIRMED",
            ],
          },
          classification: {
            type: "string",
            nullable: true,
            enum: ["IT_SUPPORT", "OFF_TOPIC", "NEEDS_REVIEW"],
          },
          answer: {
            type: "string",
            nullable: true,
            maxLength: 6000,
          },
          reason: {
            type: "string",
            maxLength: 500,
          },
          attempts: {
            type: "integer",
            minimum: 1,
            maximum: 3,
          },
          provider: {
            type: "string",
          },
          model: {
            type: "string",
          },
          promptVersion: {
            type: "string",
          },
          createdAt: {
            type: "string",
            format: "date-time",
          },
          updatedAt: {
            type: "string",
            format: "date-time",
          },
        },
      },
    },
    responses: {
      Error400: {
        description: "Entrée invalide",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },
      Error401: {
        description: "Authentification invalide",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },
      Error403: {
        description: "Permission refusée",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },
      Error404: {
        description: "Ressource introuvable ou hors périmètre",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },
      Error409: {
        description: "Conflit",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },
      Error413: {
        description: "Corps trop volumineux",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },
      Error415: {
        description: "Encodage non pris en charge",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },
      Error429: {
        description: "Limite atteinte",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
        headers: {
          "Retry-After": {
            description: "Secondes avant nouvelle tentative (limiteur HTTP).",
            schema: {
              type: "integer",
            },
          },
        },
      },
      Error500: {
        description: "Erreur interne",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },
      Error503: {
        description: "Service occupé",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/Error",
            },
          },
        },
      },
    },
  },
};
