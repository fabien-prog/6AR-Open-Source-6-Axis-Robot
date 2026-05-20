// src/lib/run6ar.ts
export type Vec6 = { x: number; y: number; z: number; rx: number; ry: number; rz: number };

export type Run6arEvent = { type: "log"; message: string; line: number } | { type: "error"; message: string; line: number } | { type: "cmd"; payload: any; line: number } | { type: "done" };

type Vars = Record<string, number>;
type Coords = Record<string, Vec6>;

type CartesianTarget = { x: number; y: number; z: number; a: number; b: number; c: number };

type Stmt =
  | { t: "LOG"; msg: string; line: number }
  | { t: "Home"; line: number }
  | { t: "MoveL"; mode: "Cartesian"; target: string; cartesian?: CartesianTarget; speed: number; angSpeed: number; accel: number; line: number }
  | { t: "MoveJ"; mode: "Cartesian" | "Joint"; target: string; speed: number; line: number }
  | { t: "If"; var: string; value: number; body: Stmt[]; line: number }
  | { t: "For"; counter: string; start: number; endToken: string; step: number; body: Stmt[]; line: number }
  | { t: "Counter"; name: string; init: number; inc: number; to: number; line: number }
  | { t: "Assign"; varName: string; expr: string; line: number };

type Ast = { vars: Vars; coords: Coords; body: Stmt[] };

export function* run6ar(code: string): Generator<Run6arEvent, void, unknown> {
  const rawLines = code.split(/\r?\n/);
  const lines = rawLines.map((l) => l.trim());
  let nextCmdId = 1;

  // 1) Tiny parser → AST, capturing each stmt’s original line index
  function parse(): Ast {
    const vars: Vars = {};
    const coords: Coords = {};
    let i = 0;

    // Declarations before PROC Main
    while (i < lines.length && lines[i] && !lines[i].startsWith("PROC Main")) {
      const l = lines[i++];
      if (!l) continue;

      let m: RegExpMatchArray | null;

      if ((m = l.match(/^CONST Number (\w+) = (.+);$/))) {
        vars[m[1]] = Number(m[2]);
        continue;
      }
      if ((m = l.match(/^VAR Number (\w+) = (.+);$/))) {
        vars[m[1]] = Number(m[2]);
        continue;
      }
      if ((m = l.match(/^VAR Coordinate (\w+) = \(([^)]+)\);$/))) {
        // minimal parsing (fast split)
        const parts = m[2].split(",");
        const x = parseFloat(parts[0]);
        const y = parseFloat(parts[1]);
        const z = parseFloat(parts[2]);
        const rx = parseFloat(parts[3]);
        const ry = parseFloat(parts[4]);
        const rz = parseFloat(parts[5]);
        coords[m[1]] = { x, y, z, rx, ry, rz };
        continue;
      }
    }

    // Skip the "PROC Main()" line (or "PROC Main" variants)
    if (i < lines.length && lines[i]?.startsWith("PROC Main")) i++;

    function parseBlock(endTokens: string[]): Stmt[] {
      const stmts: Stmt[] = [];
      while (i < lines.length) {
        const lineIndex = i;
        const l = lines[i++] || "";
        if (!l) continue;

        // break on any of the endTokens
        if (endTokens.includes(l)) break;

        let m: RegExpMatchArray | null;

        if ((m = l.match(/^LOG\("(.+)"\);$/))) {
          stmts.push({ t: "LOG", msg: m[1], line: lineIndex });
          continue;
        }

        if (l === "Home;") {
          stmts.push({ t: "Home", line: lineIndex });
          continue;
        }

        // MoveL inline: MoveL Cartesian [x,y,z,a,b,c] Speed N AngSpeed M Accel K;
        if ((m = l.match(/^MoveL Cartesian \[([^\]]+)\] Speed ([\d.eE+\-]+) AngSpeed ([\d.eE+\-]+) Accel ([\d.eE+\-]+);$/))) {
          const parts = m[1].split(",").map(Number);
          stmts.push({
            t: "MoveL",
            mode: "Cartesian",
            target: "",
            cartesian: { x: parts[0], y: parts[1], z: parts[2], a: parts[3], b: parts[4], c: parts[5] },
            speed: +m[2],
            angSpeed: +m[3],
            accel: +m[4],
            line: lineIndex,
          });
          continue;
        }

        // MoveL variable: MoveL Cartesian TARGET Speed N
        if ((m = l.match(/^MoveL Cartesian (\w+) Speed (\d+);$/))) {
          stmts.push({
            t: "MoveL",
            mode: "Cartesian",
            target: m[1],
            speed: +m[2],
            angSpeed: 45,
            accel: 0.1,
            line: lineIndex,
          });
          continue;
        }

        // MoveJ Cartesian|Joint TARGET Speed N
        if ((m = l.match(/^MoveJ (Cartesian|Joint) (\w+) Speed (\d+);$/))) {
          stmts.push({
            t: "MoveJ",
            mode: m[1] as "Cartesian" | "Joint",
            target: m[2],
            speed: +m[3],
            line: lineIndex,
          });
          continue;
        }

        // IF … THEN … ENDIF;
        if ((m = l.match(/^IF (\w+) == (\d+) THEN$/))) {
          const body = parseBlock(["ENDIF;"]);
          stmts.push({
            t: "If",
            var: m[1],
            value: +m[2],
            body,
            line: lineIndex,
          });
          continue;
        }

        // FOR … FROM … TO … STEP …
        if ((m = l.match(/^FOR (\w+) FROM (\d+) TO (\w+) STEP (\d+)/))) {
          const body = parseBlock(["ENDFOR;"]);
          stmts.push({
            t: "For",
            counter: m[1],
            start: +m[2],
            endToken: m[3], // name-or-number
            step: +m[4],
            body,
            line: lineIndex,
          });
          continue;
        }

        // Counter …
        if ((m = l.match(/^Counter (\w+) INIT (\d+) INC (\d+) TO (\d+);$/))) {
          stmts.push({
            t: "Counter",
            name: m[1],
            init: +m[2],
            inc: +m[3],
            to: +m[4],
            line: lineIndex,
          });
          continue;
        }

        // Assign math
        if ((m = l.match(/^(\w+)\s*:=\s*(.+);$/))) {
          stmts.push({
            t: "Assign",
            varName: m[1],
            expr: m[2],
            line: lineIndex,
          });
          continue;
        }

        // ignore unknown/blank lines silently for speed
      }
      return stmts;
    }

    const body = parseBlock(["ENDPROC"]);
    return { vars, coords, body };
  }

  // 2) Walk AST, yielding events with their source line
  function* execBlock(stmts: Stmt[], ctx: { vars: Vars; coords: Coords }): Generator<Run6arEvent, void, unknown> {
    for (const s of stmts) {
      switch (s.t) {
        case "LOG":
          yield { type: "log", message: s.msg, line: s.line };
          break;

        case "Home":
          yield { type: "log", message: "Home all axes", line: s.line };
          yield { type: "cmd", payload: { cmd: "Home", id: nextCmdId++ }, line: s.line };
          break;

        case "MoveL": {
          if (s.cartesian) {
            const { x, y, z, a, b, c } = s.cartesian;
            yield { type: "log", message: `MoveL → [${x}, ${y}, ${z}] A=${a} B=${b} C=${c} @${s.speed}mm/s`, line: s.line };
            yield {
              type: "cmd",
              payload: {
                cmd: "MoveL",
                id: nextCmdId++,
                position: [x, y, z],
                eulerDeg: [a, b, c],
                speed: s.speed,
                angSpeed: s.angSpeed,
                accel: s.accel,
              },
              line: s.line,
            };
          } else {
            const coord = ctx.coords[s.target];
            yield { type: "log", message: `MoveL (${s.mode}) → ${s.target} @${s.speed}`, line: s.line };
            if (coord) {
              yield {
                type: "cmd",
                payload: {
                  cmd: "MoveL",
                  id: nextCmdId++,
                  position: [coord.x, coord.y, coord.z],
                  eulerDeg: [coord.rx, coord.ry, coord.rz],
                  speed: s.speed,
                  angSpeed: s.angSpeed,
                  accel: s.accel,
                },
                line: s.line,
              };
            } else {
              yield {
                type: "cmd",
                payload: { cmd: "MoveL", id: nextCmdId++, mode: s.mode, target: { name: s.target }, speed: s.speed },
                line: s.line,
              };
            }
          }
          break;
        }

        case "MoveJ":
          yield { type: "log", message: `MoveJ (${s.mode}) → ${s.target} @${s.speed}`, line: s.line };
          yield {
            type: "cmd",
            payload: {
              cmd: "MoveJ",
              id: nextCmdId++,
              mode: s.mode,
              target: ctx.coords[s.target] || { name: s.target },
              speed: s.speed,
            },
            line: s.line,
          };
          break;

        case "If": {
          const val = ctx.vars[s.var] ?? 0;
          yield { type: "log", message: `IF ${s.var}==${s.value}? (got ${val})`, line: s.line };
          if (val === s.value) {
            yield { type: "log", message: "→ condition true, entering IF body", line: s.line };
            yield* execBlock(s.body, ctx);
          } else {
            yield { type: "log", message: "→ condition false, skipping IF body", line: s.line };
          }
          break;
        }

        case "For": {
          const endVal = ctx.vars[s.endToken] ?? Number(s.endToken);
          yield { type: "log", message: `FOR ${s.counter} from ${s.start} to ${endVal} step ${s.step}`, line: s.line };

          for (let v = s.start; v <= endVal; v += s.step) {
            ctx.vars[s.counter] = v;
            yield { type: "log", message: `↳ ${s.counter} = ${v}`, line: s.line };
            yield* execBlock(s.body, ctx);
          }
          break;
        }

        case "Counter":
          yield { type: "log", message: `Counter ${s.name} INIT ${s.init} INC ${s.inc} TO ${s.to}`, line: s.line };
          for (let v = s.init; v <= s.to; v += s.inc) {
            yield { type: "log", message: `↳ ${s.name} = ${v}`, line: s.line };
          }
          break;

        case "Assign": {
          const names = Object.keys(ctx.vars);
          const values = names.map((n) => ctx.vars[n]);

          let result: unknown;
          try {
            // NOTE: this executes user code; keep only if you trust the source.
            // eslint-disable-next-line no-new-func
            const fn = new Function(...names, `return ${s.expr};`) as (...args: number[]) => unknown;
            result = fn(...(values as number[]));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            yield { type: "error", message: `Error evaluating "${s.expr}": ${msg}`, line: s.line };
            break;
          }

          const num = typeof result === "number" ? result : Number(result);
          ctx.vars[s.varName] = Number.isFinite(num) ? num : 0;

          yield { type: "log", message: `${s.varName} := ${ctx.vars[s.varName]}`, line: s.line };
          yield {
            type: "cmd",
            payload: { cmd: "Assign", id: nextCmdId++, var: s.varName, value: ctx.vars[s.varName] },
            line: s.line,
          };
          break;
        }

        default:
          break;
      }
    }
  }

  // ── run ───────────────────────────────────────────────
  const ast = parse();
  yield { type: "log", message: "⏬ Starting 6AR run", line: 0 };
  yield* execBlock(ast.body, { vars: ast.vars, coords: ast.coords });
  yield { type: "log", message: "✅ 6AR run complete", line: Math.max(0, rawLines.length - 1) };
  yield { type: "done" };
}
