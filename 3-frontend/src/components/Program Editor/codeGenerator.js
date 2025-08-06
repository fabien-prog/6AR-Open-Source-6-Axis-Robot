// src/utils/codeGenerator.js
export function generateCode(state) {
    const indentUnit = "  ";
    let indentLevel = 0;
    const lines = [];

    // 1) Emit variable declarations
    state.variables.forEach((v) => {
        const isConst = v.type.includes("CONST");
        const prefix = isConst ? "CONST " : "VAR ";
        const dtMap = {
            Number: "Number",
            Boolean: "Boolean",
            String: "String",
            Coordinate: "Coordinate",
            Array: "Array",
        };
        const dt = dtMap[v.dataType] || v.dataType;
        // e.g. CONST Number pi = 3.1415;
        lines.push(`${prefix}${dt} ${v.name} = ${v.value};`);
    });

    lines.push("");
    lines.push("PROC Main()");
    indentLevel++;

    // helper to emit an indented line
    const emit = (txt) => {
        lines.push(indentUnit.repeat(indentLevel) + txt);
    };

    // track IF/FOR nesting
    const stack = [];

    // 2) Walk blocks
    state.blocks.forEach((b) => {
        const src = b.src || "manual";

        switch (b.type) {
            case "Move L": {
                const target = src === "manual" ? b.cartesian : b.pointVariable;
                emit(`MoveL Cartesian ${target} Speed ${b.speed};`);
                break;
            }
            case "Move J": {
                let mode, target;
                if (src === "manual") {
                    mode = b.moveMode === "joint" ? "Joint" : "Cartesian";
                    target = mode === "Joint"
                        ? `[${(b.joints || []).join(",")}]`
                        : b.cartesian;
                } else {
                    const def = state.variables.find((v) => v.name === b.pointVariable);
                    mode = def?.representation === "Joint" ? "Joint" : "Cartesian";
                    target = b.pointVariable;
                }
                emit(`MoveJ ${mode} ${target} Speed ${b.speed};`);
                break;
            }
            case "Home":
                emit("Home;");
                break;

            case "If": {
                const left = b.variableSource === "Constant" ? b.condition : b.io;
                emit(`IF ${left} ${b.operator} ${b.value} THEN`);
                stack.push("IF");
                indentLevel++;
                break;
            }
            case "Else":
                indentLevel--;
                emit("ELSE");
                indentLevel++;
                break;
            case "End If":
                indentLevel--;
                emit("ENDIF;");
                stack.pop();
                break;

            case "For Loop":
                emit(`FOR ${b.counter} FROM ${b.start} TO ${b.end} STEP ${b.step}`);
                stack.push("FOR");
                indentLevel++;
                break;
            case "End For":
                indentLevel--;
                emit("ENDFOR;");
                stack.pop();
                break;

            case "Then": {
                const name = b.targetCounter;
                if (b.action.includes("Increase")) emit(`${name} := ${name} + 1;`);
                else if (b.action.includes("Decrease")) emit(`${name} := ${name} - 1;`);
                else if (b.action.includes("Set")) emit(`${name} := ${b.value || 0};`);
                break;
            }

            case "Counter":
                emit(`COUNTER ${b.name} INIT ${b.initial} INC ${b.increment} TO ${b.target};`);
                break;

            case "Console Log":
                emit(`LOG("${b.message}");`);
                break;

            case "Math":
                // <— this ensures MATH blocks are emitted
                if (b.varName && b.expression) {
                    emit(`${b.varName} := ${b.expression};`);
                }
                break;

            default:
                // unhandled block
                break;
        }
    });

    // 3) Close PROC
    indentLevel = 0;
    lines.push("ENDPROC");

    return lines.join("\n");
}
