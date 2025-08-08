export function* run6ar(code) {
    const rawLines = code.split(/\r?\n/);
    const lines = rawLines.map((l) => l.trim());
    let nextCmdId = 1;

    // 1) Tiny parser → AST, capturing each stmt’s original line index
    function parse() {
        const vars = {};
        const coords = {};
        let i = 0;

        // Declarations before PROC Main
        while (i < lines.length && lines[i] && !lines[i].startsWith("PROC Main")) {
            const l = lines[i++];
            if (!l) continue;
            let m;

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
                const x = parseFloat(parts[0]),
                    y = parseFloat(parts[1]),
                    z = parseFloat(parts[2]),
                    rx = parseFloat(parts[3]),
                    ry = parseFloat(parts[4]),
                    rz = parseFloat(parts[5]);
                coords[m[1]] = { x, y, z, rx, ry, rz };
                continue;
            }
        }

        // Skip the "PROC Main()" line
        i++;

        function parseBlock(endTokens) {
            const stmts = [];
            while (i < lines.length) {
                const lineIndex = i;
                const l = lines[i++] || "";
                if (!l) continue;

                // break on any of the endTokens
                if (endTokens.includes(l)) break;

                let m;
                if ((m = l.match(/^LOG\("(.+)"\);$/))) {
                    stmts.push({ t: "LOG", msg: m[1], line: lineIndex });
                    continue;
                }

                if (l === "Home;") {
                    stmts.push({ t: "Home", line: lineIndex });
                    continue;
                }

                // MoveL Cartesian TARGET Speed N
                if ((m = l.match(/^MoveL Cartesian (\w+) Speed (\d+);$/))) {
                    stmts.push({
                        t: "MoveL",
                        mode: "Cartesian",
                        target: m[1],
                        speed: +m[2],
                        line: lineIndex,
                    });
                    continue;
                }

                // MoveJ Cartesian|Joint TARGET Speed N
                if ((m = l.match(/^MoveJ (Cartesian|Joint) (\w+) Speed (\d+);$/))) {
                    stmts.push({
                        t: "MoveJ",
                        mode: m[1],
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
                        endToken: m[3], // name‐or‐number
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
    function* execBlock(stmts, ctx) {
        for (const s of stmts) {
            switch (s.t) {
                case "LOG":
                    yield { type: "log", message: s.msg, line: s.line };
                    break;

                case "Home":
                    yield { type: "log", message: "Home all axes", line: s.line };
                    yield {
                        type: "cmd",
                        payload: { cmd: "Home", id: nextCmdId++ },
                        line: s.line,
                    };
                    break;

                case "MoveL":
                    yield {
                        type: "log",
                        message: `MoveL (${s.mode}) → ${s.target} @${s.speed}`,
                        line: s.line,
                    };
                    yield {
                        type: "cmd",
                        payload: {
                            cmd: "MoveL",
                            id: nextCmdId++,
                            mode: s.mode,
                            target: ctx.coords[s.target] || { name: s.target },
                            speed: s.speed,
                        },
                        line: s.line,
                    };
                    break;

                case "MoveJ":
                    yield {
                        type: "log",
                        message: `MoveJ (${s.mode}) → ${s.target} @${s.speed}`,
                        line: s.line,
                    };
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
                    yield {
                        type: "log",
                        message: `IF ${s.var}==${s.value}? (got ${val})`,
                        line: s.line,
                    };
                    if (val === s.value) {
                        yield {
                            type: "log",
                            message: "→ condition true, entering IF body",
                            line: s.line,
                        };
                        yield* execBlock(s.body, ctx);
                    } else {
                        yield {
                            type: "log",
                            message: "→ condition false, skipping IF body",
                            line: s.line,
                        };
                    }
                    break;
                }

                case "For": {
                    const endVal = ctx.vars[s.endToken] ?? Number(s.endToken);
                    yield {
                        type: "log",
                        message: `FOR ${s.counter} from ${s.start} to ${endVal} step ${s.step}`,
                        line: s.line,
                    };
                    for (let v = s.start; v <= endVal; v += s.step) {
                        ctx.vars[s.counter] = v;
                        yield {
                            type: "log",
                            message: `↳ ${s.counter} = ${v}`,
                            line: s.line,
                        };
                        yield* execBlock(s.body, ctx);
                    }
                    break;
                }

                case "Counter":
                    yield {
                        type: "log",
                        message: `Counter ${s.name} INIT ${s.init} INC ${s.inc} TO ${s.to}`,
                        line: s.line,
                    };
                    for (let v = s.init; v <= s.to; v += s.inc) {
                        yield {
                            type: "log",
                            message: `↳ ${s.name} = ${v}`,
                            line: s.line,
                        };
                    }
                    break;

                case "Assign": {
                    const names = Object.keys(ctx.vars);
                    const values = names.map((n) => ctx.vars[n]);
                    let result;
                    try {
                        // eslint-disable-next-line no-new-func
                        const fn = new Function(...names, `return ${s.expr};`);
                        result = fn(...values);
                    } catch (err) {
                        yield {
                            type: "error",
                            message: `Error evaluating "${s.expr}": ${err.message}`,
                            line: s.line,
                        };
                        break;
                    }
                    ctx.vars[s.varName] = result;
                    yield {
                        type: "log",
                        message: `${s.varName} := ${result}`,
                        line: s.line,
                    };
                    yield {
                        type: "cmd",
                        payload: {
                            cmd: "Assign",
                            id: nextCmdId++,
                            var: s.varName,
                            value: result,
                        },
                        line: s.line,
                    };
                    break;
                }

                default:
                    // ignore unknown for speed; emit an error if you prefer:
                    // yield { type: "error", message: `Unknown statement type: ${s.t}`, line: s.line };
                    break;
            }
        }
    }

    // ── run ───────────────────────────────────────────────
    const ast = parse();
    yield { type: "log", message: "⏬ Starting 6AR run", line: 0 };
    yield* execBlock(ast.body, { vars: ast.vars, coords: ast.coords });
    yield {
        type: "log",
        message: "✅ 6AR run complete",
        line: rawLines.length - 1,
    };
    yield { type: "done" };
}