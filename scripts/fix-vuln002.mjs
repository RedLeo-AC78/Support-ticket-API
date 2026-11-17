// Correctif pédagogique à exécuter depuis la racine support-ticket.
import { readFileSync, writeFileSync } from "node:fs";

const routePath = "src/routes/auth.routes.ts";
const testPath = "tests/hardening.test.mjs";
const route = readFileSync(routePath, "utf8");
const test = readFileSync(testPath, "utf8");

if (route.includes("const validateLoginBody:")) {
  console.log("Correctif déjà présent ; aucun fichier modifié.");
} else {
  const importBefore = 'import { digest } from "../utils/security.js";';
  const marker = '  router.post(\n    "/login",\n    byIp,\n';
  const normalized = route.replaceAll("\r\n", "\n");
  const testNormalized = test.replaceAll("\r\n", "\n");
  const loop = "for (let i = 0; i < 10; i++)";

  if (
    !normalized.includes(importBefore) ||
    !normalized.includes(marker) ||
    !testNormalized.includes(loop)
  )
    throw new Error(
      "Fichiers différents de la version attendue : aucune modification appliquée.",
    );

  const validation = `  // La limite IP protège aussi les corps invalides ; le quota email suit la validation.
  const validateLoginBody: RequestHandler = (req, _res, next) => {
    const body = objectBody(req.body, ["email", "password"]);

    emailValue(body.email);
    passwordValue(body.password);

    next();
  };

`;
  const updated = normalized
    .replace(
      importBefore,
      'import { digest, emailValue, objectBody, passwordValue } from "../utils/security.js";',
    )
    .replace(marker, validation + marker + "    validateLoginBody,\n");

  writeFileSync(routePath, updated);
  // Le test HTTP existant vérifie désormais le quota IP sur 30 corps invalides.
  writeFileSync(
    testPath,
    testNormalized.replace(loop, "for (let i = 0; i < 30; i++)"),
  );
  console.log("VULN-002 : validation ajoutée entre limite IP et limite email.");
  console.log(
    "Test HTTP adapté : la limite IP continue à compter les saisies invalides.",
  );
  console.log(
    "Correction écrite seulement ; compilation et retest restent à exécuter.",
  );
}
