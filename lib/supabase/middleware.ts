import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasEnvVars } from "../utils";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // If the env vars are not set, skip middleware check
  if (!hasEnvVars) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Ja nav lietotāja un mēģina piekļūt admin panelim
  if (request.nextUrl.pathname.startsWith("/admin") && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  // Ja ir lietotājs un mēģina piekļūt admin panelim, pārbaudām role (bet tikai middleware līmenī)
  if (request.nextUrl.pathname.startsWith("/admin") && user) {
    try {
      // Mēģinām iegūt user profile, bet ja neizdodas, ļaujam React komponentes pārvaldīt
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      // Ja ir kļūda (tabula neeksistē, nav tiesību, utt.), ļaujam React komponentes to pārvaldīt
      if (error) {
        console.log('Middleware: Could not check user role, delegating to React components');
        // Nenovirzām nekur, ļaujam React komponentes to pārvaldīt
        return supabaseResponse;
      }

      // Ja nav admin role un nav kļūdas
      if (profile && profile.role !== 'admin') {
        const url = request.nextUrl.clone();
        url.pathname = "/auth/unauthorized";
        return NextResponse.redirect(url);
      }

    } catch (error) {
      // Ja ir neparedzēta kļūda, ļaujam React komponentes to pārvaldīt
      console.log('Middleware: Unexpected error checking user role:', error);
      return supabaseResponse;
    }
  }

  // Pārējās lapas (ne-admin)
  if (
    request.nextUrl.pathname !== "/" &&
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth") &&
    !request.nextUrl.pathname.startsWith("/admin")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}