import serverless from "serverless-http";
import { app } from "../../server/index.js";
import { getOwnerActor } from "../../server/owner-access.js";

const expressHandler = serverless(app, {
  basePath: "/.netlify/functions/owner-api",
});

export async function handler(event, context) {
  // Netlify supplies this identity only after authenticating access to a private
  // project. Never trust identity headers sent by the browser.
  const actor = getOwnerActor(context?.user, process.env.OWNER_ADMIN_EMAILS);
  if (!actor) {
    return {
      statusCode: 403,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ error: "An authorized Netlify owner administrator is required." }),
    };
  }

  const headers = { ...(event.headers || {}) };
  for (const key of Object.keys(headers)) {
    if (["x-candid-owner-id", "x-candid-owner-email"].includes(key.toLowerCase())) delete headers[key];
  }
  headers["x-candid-owner-id"] = actor.id;
  headers["x-candid-owner-email"] = actor.email;
  const multiValueHeaders = { ...(event.multiValueHeaders || {}) };
  for (const key of Object.keys(multiValueHeaders)) {
    if (["x-candid-owner-id", "x-candid-owner-email"].includes(key.toLowerCase())) delete multiValueHeaders[key];
  }
  return expressHandler({ ...event, headers, multiValueHeaders }, context);
}
