// Undurchsichtiger Landing-Token für ?c={token}. crypto.randomUUID()
// liefert 122 Bit Zufall — praktisch kollisionsfrei; die DB hat zusätzlich
// einen UNIQUE-Index als Backstop. Gleicher Mechanismus im Browser
// (Enroll) und in Deno (send-campaign Edge-Fn).
export function newToken(): string {
  return crypto.randomUUID();
}
