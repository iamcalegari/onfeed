import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// O guia do Clerk sugere `proxy.ts`, mas essa convenção não é reconhecida pelo
// Next 15.5.x — aqui tem que ser `middleware.ts` (quando subir o Next p/ uma
// versão que suporte proxy, é só renomear).
//
// Sem a chave do Clerk, a auth fica desabilitada e o middleware só segue adiante
// (mantém o app rodando localmente antes de configurar o Clerk).
export default process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  ? clerkMiddleware()
  : () => NextResponse.next();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // sempre roda no caminho do auto-proxy do Clerk
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
