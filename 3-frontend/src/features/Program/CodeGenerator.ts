// Pure, allocation-light codegen. Behavior unchanged.
export function generateCode(state: { variables: Array<any>; blocks: Array<any> }) {
  const indentUnit = "  ";
  let indentLevel = 0;
  const lines: string[] = [];

  // 1) Emit variable declarations
  for (let i = 0; i < state.variables.length; i++) {
    const v = state.variables[i];
    const isConst = String(v.type || "").includes("CONST");
    const prefix = isConst ? "CONST " : "VAR ";

    const dtMap: Record<string, string> = {
      Number: "Number",
      Boolean: "Boolean",
      String: "String",
      Coordinate: "Coordinate",
      Array: "Array",
    };

    const dt = dtMap[v.dataType] || v.dataType;
    lines.push(`${prefix}${dt} ${v.name} = ${v.value};`);
  }

  lines.push("");
  lines.push("PROC Main()");
  indentLevel++;

  const emit = (txt: string) => {
    lines.push(indentUnit.repeat(indentLevel) + txt);
  };

  // 2) Walk blocks
  for (let i = 0; i < state.blocks.length; i++) {
    const b = state.blocks[i];
    const src = b.src || "manual";

    switch (b.type) {
      case "Move L": {
        const target = src === "manual" ? b.cartesian : b.pointVariable;
        emit(`MoveL Cartesian ${target} Speed ${b.speed};`);
        break;
      }

      case "Move J": {
        let mode: string, target: string;
        if (src === "manual") {
          mode = b.moveMode === "joint" ? "Joint" : "Cartesian";
          target = mode === "Joint" ? `[${(b.joints || []).join(",")}]` : b.cartesian;
        } else {
          const def = state.variables.find((v: any) => v.name === b.pointVariable);
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
        break;

      case "For Loop":
        emit(`FOR ${b.counter} FROM ${b.start} TO ${b.end} STEP ${b.step}`);
        indentLevel++;
        break;

      case "End For":
        indentLevel--;
        emit("ENDFOR;");
        break;

      case "Then": {
        const name = b.targetCounter;
        if (String(b.action).includes("Increase")) emit(`${name} := ${name} + 1;`);
        else if (String(b.action).includes("Decrease")) emit(`${name} := ${name} - 1;`);
        else if (String(b.action).includes("Set")) emit(`${name} := ${b.value || 0};`);
        break;
      }

      case "Counter":
        // NOTE: your parser expects "Counter ..." not "COUNTER ..."
        emit(`Counter ${b.name} INIT ${b.initial} INC ${b.increment} TO ${b.target};`);
        break;

      case "Console Log":
        emit(`LOG("${b.message}");`);
        break;

      case "Math":
        if (b.varName && b.expression) emit(`${b.varName} := ${b.expression};`);
        break;

      case "SetDO":
        emit(`SetDO(DO_${b.pin},${b.state});`);
        break;

      case "WaitDI":
        emit(`WaitDI(DI_${b.pin},${b.state});`);
        break;

      default:
        break;
    }
  }

  // 3) Close PROC
  indentLevel = 0;
  lines.push("ENDPROC");
  return lines.join("\n");
}
