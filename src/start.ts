import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [
    errorMiddleware,
    // Start installs CSRF protection automatically when src/start.ts is absent;
    // defining this file opts out, so it is re-added explicitly to keep server
    // functions protected from cross-site requests.
    //
    // Constructed inside the factory, not at module scope. `createCsrfMiddleware`
    // is a `const` export, and in the production bundle a top-level call here
    // can run before its defining module has initialised — which fails with
    // "createCsrfMiddleware is not a function" on every request. Dev does not
    // bundle, so it only ever showed up in a built deployment.
    createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === "serverFn" }),
  ],
}));
