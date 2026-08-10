import path from "node:path";

import ts from "typescript";

export interface MutationSourceEvidence {
  path: string;
  sourceText: string;
}

export interface MutationSourceRef {
  path: string;
  symbol: string;
}

export interface MutationAdmissionBinding {
  admission?: MutationSourceRef;
  route?: { method: string; url: string };
  evidencePaths: readonly string[];
}

export type MutationEffectAtomicity =
  | "database_transaction"
  | "browser_storage_transaction"
  | "auth_adapter_commit"
  | "provider_operation"
  | "cookie_commit"
  | "sql_trigger_commit"
  | "single_best_effort_attempt";

export type MutationEffectFamily =
  | "canonical_row"
  | "transactional_outbox"
  | "public_projection"
  | "quarantine_object"
  | "public_derivative"
  | "auth_account"
  | "auth_session"
  | "browser_cookie"
  | "browser_storage"
  | "analytics_event"
  | "external_call";

export type MutationEffectExecutionMode =
  | "required"
  | "conditional"
  | "best_effort_after_commit"
  | "asynchronous_from_durable_intent";

export interface MutationEffectTrace {
  ownerPath: string;
  ownerSymbol: string;
  commitLabel: string;
  atomicity: MutationEffectAtomicity;
  effectFamilies: readonly MutationEffectFamily[];
  executionMode: MutationEffectExecutionMode;
  evidencePaths: readonly string[];
  order: number;
  transactionScopeId?: string;
}

export interface MutationFunctionTrace {
  resolved: boolean;
  effects: readonly MutationEffectTrace[];
  unresolvedInternalCalls: readonly string[];
}

interface SourceModel {
  path: string;
  sourceFile: ts.SourceFile;
  sourceText: string;
  definitions: Map<string, ts.Node>;
  imports: Map<string, MutationSourceRef>;
  namespaceImports: Map<string, string>;
  reexports: Map<string, MutationSourceRef>;
}

interface MutableTrace {
  resolved: boolean;
  effects: MutationEffectTrace[];
  unresolvedInternalCalls: string[];
}

interface TransactionScope {
  id: string;
  kind: "database" | "browser_storage";
  ordinal: number;
  callStart: number;
  bodyStart: number;
  bodyEnd: number;
  executorParameter: string | null;
}

const DATABASE_MUTATION_METHODS = new Set([
  "deleteFrom",
  "insertInto",
  "updateTable",
]);
const SEARCH_MUTATION_METHODS = new Set([
  "addDocuments",
  "deleteAllDocuments",
  "deleteDocument",
  "deleteDocuments",
  "updateDocuments",
]);
const BROWSER_STORAGE_MUTATION_METHODS = new Set([
  "add",
  "bulkAdd",
  "bulkDelete",
  "bulkPut",
  "clear",
  "delete",
  "put",
]);

export class AuthenticatedMutationSourceGraph {
  readonly #models = new Map<string, SourceModel>();

  constructor(sources: readonly MutationSourceEvidence[]) {
    for (const source of sources) {
      const repositoryPath = normalizeRepositoryPath(source.path);
      const sourceFile = ts.createSourceFile(
        repositoryPath,
        source.sourceText,
        ts.ScriptTarget.Latest,
        true,
        scriptKindForPath(repositoryPath),
      );
      this.#models.set(repositoryPath, {
        path: repositoryPath,
        sourceFile,
        sourceText: source.sourceText,
        definitions: collectDefinitions(sourceFile),
        imports: new Map(),
        namespaceImports: new Map(),
        reexports: new Map(),
      });
    }
    for (const model of this.#models.values()) this.#indexImports(model);
  }

  sourceText(repositoryPath: string): string {
    return this.#models.get(normalizeRepositoryPath(repositoryPath))?.sourceText ?? "";
  }

  resolveRef(ref: MutationSourceRef): MutationSourceRef | null {
    let current: MutationSourceRef = {
      path: normalizeRepositoryPath(ref.path),
      symbol: ref.symbol,
    };
    const seen = new Set<string>();
    while (true) {
      const key = refKey(current);
      if (seen.has(key)) return null;
      seen.add(key);
      const model = this.#models.get(current.path);
      if (!model) return null;
      const definition = model.definitions.get(current.symbol);
      if (definition) {
        if (
          ts.isVariableDeclaration(definition) &&
          definition.initializer &&
          !ts.isArrowFunction(definition.initializer) &&
          !ts.isFunctionExpression(definition.initializer)
        ) {
          const alias = this.#resolveExpressionRef(
            model.path,
            definition.initializer,
          );
          if (alias && refKey(alias) !== key) {
            current = alias;
            continue;
          }
        }
        return current;
      }
      const forwarded =
        model.reexports.get(current.symbol) ?? model.imports.get(current.symbol);
      if (!forwarded) return null;
      current = forwarded;
    }
  }

  resolveNativeFormAdmissions(input: {
    path: string;
    componentSymbol: string;
    variant: string;
    serverAdmissions: ReadonlySet<string>;
  }): MutationAdmissionBinding[] {
    const separator = input.variant.indexOf(":");
    if (separator < 0) return [];
    const attributeName = input.variant.slice(0, separator);
    const expressionText = input.variant.slice(separator + 1).trim();
    const evidencePaths = new Set([normalizeRepositoryPath(input.path)]);
    const direct = this.#resolveTextRef(input.path, expressionText);
    if (direct && input.serverAdmissions.has(refKey(direct))) {
      evidencePaths.add(direct.path);
      return [{ admission: direct, evidencePaths: sorted(evidencePaths) }];
    }
    if (direct) {
      const forwarded = this.#resolveFunctionAdmissions(
        direct,
        { path: input.path, symbol: input.componentSymbol },
        input.serverAdmissions,
        evidencePaths,
        new Set(),
      );
      if (forwarded.length > 0) return forwarded;
    }
    if (!isSimpleIdentifier(expressionText)) return [];

    const component = this.resolveRef({
      path: input.path,
      symbol: input.componentSymbol,
    });
    if (!component) return [];
    return this.#resolveComponentProp(
      component,
      attributeName === "useActionState" ? expressionText : expressionText,
      input.serverAdmissions,
      evidencePaths,
      new Set(),
      this.#nativeFormMethod(input.path, input.componentSymbol, expressionText),
    );
  }

  traceFunction(ref: MutationSourceRef): MutationFunctionTrace {
    const resolved = this.resolveRef(ref);
    if (!resolved) {
      return {
        resolved: false,
        effects: [],
        unresolvedInternalCalls: [refKey(ref)],
      };
    }
    const traced = this.#traceResolvedFunction(resolved, new Set());
    return {
      resolved: traced.resolved,
      effects: mergeEffects(traced.effects),
      unresolvedInternalCalls: sorted(new Set(traced.unresolvedInternalCalls)),
    };
  }

  #indexImports(model: SourceModel): void {
    for (const statement of model.sourceFile.statements) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const targetPath = this.#resolveModulePath(
          model.path,
          statement.moduleSpecifier.text,
        );
        if (!targetPath || !statement.importClause) continue;
        if (statement.importClause.name) {
          model.imports.set(statement.importClause.name.text, {
            path: targetPath,
            symbol: "default",
          });
        }
        const bindings = statement.importClause.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            model.imports.set(element.name.text, {
              path: targetPath,
              symbol: element.propertyName?.text ?? element.name.text,
            });
          }
        } else if (bindings && ts.isNamespaceImport(bindings)) {
          model.namespaceImports.set(bindings.name.text, targetPath);
        }
        continue;
      }
      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause) &&
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier)
      ) {
        const targetPath = this.#resolveModulePath(
          model.path,
          statement.moduleSpecifier.text,
        );
        if (!targetPath) continue;
        for (const element of statement.exportClause.elements) {
          model.reexports.set(element.name.text, {
            path: targetPath,
            symbol: element.propertyName?.text ?? element.name.text,
          });
        }
      }
    }
  }

  #resolveModulePath(fromPath: string, specifier: string): string | null {
    const base = specifier.startsWith("@/")
      ? `src/${specifier.slice(2)}`
      : specifier.startsWith(".")
        ? path.posix.normalize(
            path.posix.join(path.posix.dirname(fromPath), specifier),
          )
        : null;
    if (!base) return null;
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mts`,
      `${base}.cts`,
      `${base}.js`,
      `${base}.jsx`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
      `${base}/index.js`,
    ]) {
      if (this.#models.has(candidate)) return candidate;
    }
    return null;
  }

  #resolveTextRef(fromPath: string, expressionText: string): MutationSourceRef | null {
    const trimmed = expressionText.trim();
    const bindMatch = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\.bind\b/.exec(
      trimmed,
    );
    const candidate = bindMatch?.[1] ?? trimmed;
    if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?$/.test(candidate)) {
      return null;
    }
    const model = this.#models.get(normalizeRepositoryPath(fromPath));
    if (!model) return null;
    const [head, tail] = candidate.split(".");
    if (!head) return null;
    if (tail && model.namespaceImports.has(head)) {
      return this.resolveRef({
        path: model.namespaceImports.get(head)!,
        symbol: tail,
      });
    }
    const actionStateRef = this.#resolveActionStateBinding(model.path, head);
    if (actionStateRef) return actionStateRef;
    return this.resolveRef({ path: model.path, symbol: head });
  }

  #resolveExpressionRef(
    fromPath: string,
    expression: ts.Expression,
  ): MutationSourceRef | null {
    let current = expression;
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isAwaitExpression(current)
    ) {
      current = current.expression;
    }
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === "bind"
    ) {
      return this.#resolveExpressionRef(fromPath, current.expression.expression);
    }
    if (ts.isIdentifier(current)) {
      const actionStateRef = this.#resolveActionStateBinding(
        normalizeRepositoryPath(fromPath),
        current.text,
      );
      if (actionStateRef) return actionStateRef;
      return this.resolveRef({ path: fromPath, symbol: current.text });
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return (
        this.#resolveExpressionRef(fromPath, current.left) ??
        this.#resolveExpressionRef(fromPath, current.right)
      );
    }
    if (ts.isPropertyAccessExpression(current)) {
      const model = this.#models.get(normalizeRepositoryPath(fromPath));
      if (
        model &&
        ts.isIdentifier(current.expression) &&
        model.namespaceImports.has(current.expression.text)
      ) {
        return this.resolveRef({
          path: model.namespaceImports.get(current.expression.text)!,
          symbol: current.name.text,
        });
      }
    }
    return null;
  }

  #resolveComponentProp(
    component: MutationSourceRef,
    propName: string,
    serverAdmissions: ReadonlySet<string>,
    inheritedEvidence: ReadonlySet<string>,
    seen: Set<string>,
    routeMethod: string,
  ): MutationAdmissionBinding[] {
    const canonicalComponent = this.resolveRef(component);
    if (!canonicalComponent) return [];
    const stateKey = `${refKey(canonicalComponent)}#${propName}`;
    if (seen.has(stateKey)) return [];
    const nextSeen = new Set(seen).add(stateKey);
    const bindings: MutationAdmissionBinding[] = [];

    for (const model of this.#models.values()) {
      const visit = (node: ts.Node): void => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tagRef = this.#resolveJsxTagRef(model.path, node.tagName);
          if (tagRef && refKey(tagRef) === refKey(canonicalComponent)) {
            const attribute = node.attributes.properties.find(
              (property): property is ts.JsxAttribute =>
                ts.isJsxAttribute(property) &&
                property.name.getText(model.sourceFile) === propName,
            );
            const expression =
              attribute?.initializer && ts.isJsxExpression(attribute.initializer)
                ? attribute.initializer.expression
                : undefined;
            if (expression) {
              const evidence = new Set(inheritedEvidence).add(model.path);
              const direct = this.#resolveExpressionRef(model.path, expression);
              if (direct && serverAdmissions.has(refKey(direct))) {
                evidence.add(direct.path);
                bindings.push({
                  admission: direct,
                  evidencePaths: sorted(evidence),
                });
              } else if (ts.isIdentifier(expression)) {
                const enclosing = enclosingFunctionSymbol(node);
                if (enclosing) {
                  const forwarded = this.#resolveComponentProp(
                    { path: model.path, symbol: enclosing },
                    expression.text,
                    serverAdmissions,
                    evidence,
                    nextSeen,
                    routeMethod,
                  );
                  bindings.push(...forwarded);
                }
              }
            } else if (
              attribute?.initializer &&
              ts.isStringLiteral(attribute.initializer) &&
              attribute.initializer.text.startsWith("/")
            ) {
              bindings.push({
                route: {
                  method: routeMethod,
                  url: attribute.initializer.text,
                },
                evidencePaths: sorted(
                  new Set(inheritedEvidence).add(model.path),
                ),
              });
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(model.sourceFile);
    }

    return deduplicateBindings(bindings);
  }

  #resolveFunctionAdmissions(
    functionRef: MutationSourceRef,
    componentRef: MutationSourceRef,
    serverAdmissions: ReadonlySet<string>,
    inheritedEvidence: ReadonlySet<string>,
    seen: Set<string>,
  ): MutationAdmissionBinding[] {
    const resolved = this.resolveRef(functionRef);
    if (!resolved) return [];
    const key = `function:${refKey(resolved)}`;
    if (seen.has(key)) return [];
    const nextSeen = new Set(seen).add(key);
    const model = this.#models.get(resolved.path);
    const definition = model?.definitions.get(resolved.symbol);
    const body = definition ? definitionBody(definition) : null;
    if (!model || !body) return [];
    const bindings: MutationAdmissionBinding[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const called = this.#resolveCallRef(model, node.expression);
        const canonical = called ? this.resolveRef(called) : null;
        if (canonical && serverAdmissions.has(refKey(canonical))) {
          bindings.push({
            admission: canonical,
            evidencePaths: sorted(
              new Set(inheritedEvidence).add(resolved.path).add(canonical.path),
            ),
          });
        } else if (ts.isIdentifier(node.expression)) {
          bindings.push(
            ...this.#resolveComponentProp(
              componentRef,
              node.expression.text,
              serverAdmissions,
              new Set(inheritedEvidence).add(resolved.path),
              nextSeen,
              "POST",
            ),
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return deduplicateBindings(bindings);
  }

  #resolveActionStateBinding(
    repositoryPath: string,
    bindingName: string,
  ): MutationSourceRef | null {
    const model = this.#models.get(repositoryPath);
    if (!model) return null;
    let resolved: MutationSourceRef | null = null;
    const visit = (node: ts.Node): void => {
      if (resolved) return;
      if (
        ts.isVariableDeclaration(node) &&
        ts.isArrayBindingPattern(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        terminalCallName(node.initializer.expression) === "useActionState"
      ) {
        const containsBinding = node.name.elements.some(
          (element) =>
            ts.isBindingElement(element) &&
            ts.isIdentifier(element.name) &&
            element.name.text === bindingName,
        );
        const action = node.initializer.arguments[0];
        if (containsBinding && action) {
          resolved = this.#resolveExpressionRef(repositoryPath, action);
          return;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(model.sourceFile);
    return resolved;
  }

  #nativeFormMethod(
    repositoryPath: string,
    componentSymbol: string,
    expressionText: string,
  ): string {
    const model = this.#models.get(normalizeRepositoryPath(repositoryPath));
    const definition = model?.definitions.get(componentSymbol);
    const body = definition ? definitionBody(definition) : null;
    if (!model || !body) return "POST";
    let method = "POST";
    const visit = (node: ts.Node): void => {
      if (
        (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
        ts.isIdentifier(node.tagName) &&
        node.tagName.text === "form"
      ) {
        const action = node.attributes.properties.find(
          (property): property is ts.JsxAttribute =>
            ts.isJsxAttribute(property) && property.name.getText() === "action",
        );
        const expression =
          action?.initializer && ts.isJsxExpression(action.initializer)
            ? action.initializer.expression
            : null;
        if (expression?.getText(model.sourceFile).trim() !== expressionText) return;
        const methodAttribute = node.attributes.properties.find(
          (property): property is ts.JsxAttribute =>
            ts.isJsxAttribute(property) && property.name.getText() === "method",
        );
        if (
          methodAttribute?.initializer &&
          ts.isStringLiteral(methodAttribute.initializer)
        ) {
          method = methodAttribute.initializer.text.toUpperCase();
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(body);
    return method;
  }

  #resolveJsxTagRef(
    fromPath: string,
    tagName: ts.JsxTagNameExpression,
  ): MutationSourceRef | null {
    if (ts.isIdentifier(tagName)) {
      return this.resolveRef({ path: fromPath, symbol: tagName.text });
    }
    if (
      ts.isPropertyAccessExpression(tagName) &&
      ts.isIdentifier(tagName.expression)
    ) {
      const model = this.#models.get(normalizeRepositoryPath(fromPath));
      const targetPath = model?.namespaceImports.get(tagName.expression.text);
      return targetPath
        ? this.resolveRef({ path: targetPath, symbol: tagName.name.text })
        : null;
    }
    return null;
  }

  #traceResolvedFunction(
    ref: MutationSourceRef,
    active: Set<string>,
  ): MutableTrace {
    const key = refKey(ref);
    if (active.has(key)) {
      return { resolved: true, effects: [], unresolvedInternalCalls: [] };
    }
    const model = this.#models.get(ref.path);
    const definition = model?.definitions.get(ref.symbol);
    if (!model || !definition) {
      return {
        resolved: false,
        effects: [],
        unresolvedInternalCalls: [key],
      };
    }
    const nextActive = new Set(active).add(key);
    const body = definitionBody(definition);
    if (!body) {
      return { resolved: true, effects: [], unresolvedInternalCalls: [] };
    }
    const text = body.getText(model.sourceFile);
    const effects: MutationEffectTrace[] = [];
    const unresolvedInternalCalls: string[] = [];
    const callExpressions: ts.CallExpression[] = [];
    const collectCalls = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) callExpressions.push(node);
      ts.forEachChild(node, collectCalls);
    };
    collectCalls(body);
    callExpressions.sort((left, right) => left.getStart() - right.getStart());
    const transactionScopes = findTransactionScopes(
      callExpressions,
      model.sourceFile,
    );

    for (const call of callExpressions) {
      const order = call.getStart(model.sourceFile);
      const transactionScope = innermostTransactionScope(
        transactionScopes,
        order,
      );
      const direct = classifyDirectCall(ref, call, model.sourceFile, order);
      if (direct) {
        effects.push(
          transactionScope &&
            ((transactionScope.kind === "database" &&
              isTransactionExecutorCall(
                call,
                transactionScope.executorParameter,
                model.sourceFile,
              ) &&
              isCoCommittableDatabaseEffect(direct)) ||
              (transactionScope.kind === "browser_storage" &&
                isBrowserStorageEffect(direct)))
            ? { ...direct, transactionScopeId: transactionScope.id }
            : direct,
        );
      }

      const executedQueryBuilder = this.#resolveExecutedQueryBuilder(model, call);
      if (executedQueryBuilder) {
        const family = databaseFamily(executedQueryBuilder);
        const queryEffect = effect(
          ref,
          `${databaseCommitLabel(family)}:${executedQueryBuilder.symbol}`,
          "database_transaction",
          [family],
          order,
          executionModeFor(ref, family),
        );
        effects.push({
          ...queryEffect,
          evidencePaths: sorted(
            new Set([ref.path, executedQueryBuilder.path]),
          ),
          ...(transactionScope &&
          isTransactionExecutorCall(
            call,
            transactionScope.executorParameter,
            model.sourceFile,
          )
            ? { transactionScopeId: transactionScope.id }
            : {}),
        });
      }

      const calledRef = this.#resolveCallRef(model, call.expression);
      if (!calledRef || refKey(calledRef) === key) continue;
      const resolvedCall = this.resolveRef(calledRef);
      if (!resolvedCall) {
        if (this.#models.has(calledRef.path)) {
          unresolvedInternalCalls.push(refKey(calledRef));
        }
        continue;
      }
      const child = this.#traceResolvedFunction(resolvedCall, nextActive);
      unresolvedInternalCalls.push(...child.unresolvedInternalCalls);
      const passesExecutor =
        transactionScope &&
        ((transactionScope.kind === "database" &&
          callPassesExecutor(call, transactionScope.executorParameter)) ||
          transactionScope.kind === "browser_storage");
      for (const [childIndex, effect] of child.effects.entries()) {
        effects.push({
          ...effect,
          order: order + (childIndex + 1) / (child.effects.length + 1),
          ...(passesExecutor &&
          !effect.transactionScopeId &&
          ((transactionScope?.kind === "database" &&
            isCoCommittableDatabaseEffect(effect)) ||
            (transactionScope?.kind === "browser_storage" &&
              isBrowserStorageEffect(effect)))
            ? { transactionScopeId: transactionScope.id }
            : {}),
        });
      }
    }

    const collectTaggedSql = (node: ts.Node): void => {
      if (
        ts.isTaggedTemplateExpression(node) &&
        isMutatingSqlTemplate(node, model.sourceFile)
      ) {
        effects.push(
          effect(
            ref,
            "canonical-row",
            "database_transaction",
            ["canonical_row"],
            node.getStart(model.sourceFile),
          ),
        );
      }
      ts.forEachChild(node, collectTaggedSql);
    };
    collectTaggedSql(body);

    effects.push(...classifyKnownOwnerEffect(ref, text, body.getStart(model.sourceFile)));

    for (const scope of transactionScopes) {
      const coCommitted = effects.filter(
        (effect) =>
          effect.transactionScopeId === scope.id &&
          (scope.kind === "database"
            ? isCoCommittableDatabaseEffect(effect)
            : isBrowserStorageEffect(effect)),
      );
      if (coCommitted.length > 0) {
        const families = sorted(
          new Set(coCommitted.flatMap((effect) => effect.effectFamilies)),
        ) as MutationEffectFamily[];
        const evidencePaths = sorted(
          new Set([
            ref.path,
            ...coCommitted.flatMap((effect) => effect.evidencePaths),
          ]),
        );
        const retained = effects.filter(
          (effect) =>
            !(
              effect.transactionScopeId === scope.id &&
              (scope.kind === "database"
                ? isCoCommittableDatabaseEffect(effect)
                : isBrowserStorageEffect(effect))
            ),
        );
        retained.push({
          ownerPath: ref.path,
          ownerSymbol: ref.symbol,
          commitLabel:
            scope.kind === "database"
              ? `database-transaction-${scope.ordinal}`
              : `browser-storage-transaction-${scope.ordinal}`,
          atomicity:
            scope.kind === "database"
              ? "database_transaction"
              : "browser_storage_transaction",
          effectFamilies: families,
          executionMode: "required",
          evidencePaths,
          order: scope.callStart,
        });
        effects.length = 0;
        effects.push(...retained);
      }
    }

    return {
      resolved: true,
      effects: mergeEffects(effects),
      unresolvedInternalCalls,
    };
  }

  #resolveCallRef(
    model: SourceModel,
    expression: ts.LeftHandSideExpression,
  ): MutationSourceRef | null {
    if (ts.isIdentifier(expression)) {
      const imported = model.imports.get(expression.text);
      if (imported) return imported;
      if (model.definitions.has(expression.text)) {
        return { path: model.path, symbol: expression.text };
      }
      return null;
    }
    if (ts.isPropertyAccessExpression(expression)) {
      if (
        ts.isIdentifier(expression.expression) &&
        model.namespaceImports.has(expression.expression.text)
      ) {
        return {
          path: model.namespaceImports.get(expression.expression.text)!,
          symbol: expression.name.text,
        };
      }
      if (expression.name.text === "bind") {
        return this.#resolveExpressionRef(model.path, expression.expression);
      }
    }
    return null;
  }

  #resolveExecutedQueryBuilder(
    model: SourceModel,
    call: ts.CallExpression,
  ): MutationSourceRef | null {
    const method = terminalCallName(call.expression);
    if (!method || !/^execute(?:TakeFirst|TakeFirstOrThrow)?$/.test(method)) {
      return null;
    }
    let resolved: MutationSourceRef | null = null;
    const visit = (node: ts.Node): void => {
      if (resolved || !ts.isCallExpression(node)) {
        ts.forEachChild(node, visit);
        return;
      }
      const callName = terminalCallName(node.expression);
      if (callName && /^build[A-Z].*Query$/.test(callName)) {
        const candidate = this.#resolveCallRef(model, node.expression);
        resolved = candidate ? this.resolveRef(candidate) : null;
        return;
      }
      ts.forEachChild(node, visit);
    };
    visit(call.expression);
    return resolved;
  }
}

function collectDefinitions(sourceFile: ts.SourceFile): Map<string, ts.Node> {
  const definitions = new Map<string, ts.Node>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      definitions.set(node.name.text, node);
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      definitions.set(node.name.text, node);
    } else if (
      ts.isExportAssignment(node) &&
      (ts.isFunctionExpression(node.expression) || ts.isArrowFunction(node.expression))
    ) {
      definitions.set("default", node.expression);
    } else if (
      (ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node)) &&
      node.name &&
      hasDefaultModifier(node)
    ) {
      definitions.set("default", node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return definitions;
}

function definitionBody(node: ts.Node): ts.Node | null {
  if (ts.isVariableDeclaration(node) && node.initializer) {
    return definitionBody(node.initializer);
  }
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  ) {
    return node.body ?? null;
  }
  return null;
}

function classifyDirectCall(
  owner: MutationSourceRef,
  call: ts.CallExpression,
  sourceFile: ts.SourceFile,
  order: number,
): MutationEffectTrace | null {
  const method = terminalCallName(call.expression);
  if (!method) return null;
  if (DATABASE_MUTATION_METHODS.has(method)) {
    if (/^build[A-Z].*Query$/.test(owner.symbol)) return null;
    const family = databaseFamily(owner);
    return effect(owner, databaseCommitLabel(family), "database_transaction", [family], order);
  }
  if (
    /^(?:setPassword|changePassword|updateUser|deleteUser)$/.test(method) &&
    /(?:^|\.)auth\.api\./.test(call.expression.getText(sourceFile))
  ) {
    return effect(
      { path: "src/lib/auth.ts", symbol: `auth.api.${method}` },
      "auth-account",
      "auth_adapter_commit",
      ["auth_account"],
      order,
    );
  }
  if (SEARCH_MUTATION_METHODS.has(method)) {
    return effect(
      owner,
      "public-projection",
      "single_best_effort_attempt",
      ["public_projection"],
      order,
      executionModeFor(owner, "public_projection"),
    );
  }
  if (
    (method === "set" || method === "delete") &&
    /(?:^|\.)(?:cookies?|cookieStore)(?:\.|$)/i.test(
      call.expression.getText(sourceFile),
    )
  ) {
    return effect(owner, "cookie", "cookie_commit", ["browser_cookie"], order);
  }
  if (
    owner.path.includes("/offline/") &&
    BROWSER_STORAGE_MUTATION_METHODS.has(method) &&
    /(?:^|\.)(?:offlineDb|database|transaction|drafts|draftSummaries|mutations|mutationSummaries|ownerActivity)(?:\.|\[|$)/.test(
      call.expression.getText(sourceFile),
    )
  ) {
    return effect(
      owner,
      "browser-storage",
      "browser_storage_transaction",
      ["browser_storage"],
      order,
    );
  }
  if (method === "fetch") {
    const firstArgument = call.arguments[0];
    const targetText = firstArgument?.getText(sourceFile) ?? "";
    if (/^[`'"]https?:\/\//.test(targetText)) {
      return effect(
        owner,
        "external-call",
        "provider_operation",
        ["external_call"],
        order,
      );
    }
  }
  return null;
}

function classifyKnownOwnerEffect(
  owner: MutationSourceRef,
  text: string,
  order: number,
): MutationEffectTrace[] {
  if (owner.path.endsWith("src/lib/storage.ts")) {
    if (
      owner.symbol === "putPublicDerivativeObject" ||
      owner.symbol === "copyPublicDerivativeObject"
    ) {
      return [
        effect(
          owner,
          "public-derivative-write",
          "provider_operation",
          ["external_call", "public_derivative"],
          order,
        ),
      ];
    }
    if (owner.symbol === "deleteQuarantineObject") {
      return [
        effect(
          owner,
          "quarantine-delete",
          "provider_operation",
          ["external_call", "quarantine_object"],
          order,
        ),
      ];
    }
    if (owner.symbol === "deletePublicDerivativeObject") {
      return [
        effect(
          owner,
          "public-derivative-delete",
          "provider_operation",
          ["external_call", "public_derivative"],
          order,
        ),
      ];
    }
  }
  if (
    /(?:sendEmail|sendVerification|sendAuth|callPlantNet|identifyPlant|purgeCloudflare)/i.test(
      owner.symbol,
    ) &&
    /(?:fetch\s*\(|\.send\s*\()/.test(text)
  ) {
    return [
      effect(
        owner,
        "external-call",
        "provider_operation",
        ["external_call"],
        order,
        executionModeFor(owner, "external_call"),
      ),
    ];
  }
  return [];
}

function databaseFamily(owner: MutationSourceRef): MutationEffectFamily {
  const key = `${owner.path}#${owner.symbol}`;
  if (
    /public-projection-outbox|recordPublicProjectionIntent|journal_entry_unindex|media-lifecycle-enqueue|learning-attribution(?:-outbox)?|auth-email-outbox|enqueue.*(?:Job|Intent|Outbox)/i.test(
      key,
    )
  ) {
    return "transactional_outbox";
  }
  if (/analytics|learning-(?:event|signal)|record.*(?:Analytics|Event)/i.test(key)) {
    return "analytics_event";
  }
  return "canonical_row";
}

function databaseCommitLabel(family: MutationEffectFamily): string {
  if (family === "transactional_outbox") return "transactional-outbox";
  if (family === "analytics_event") return "analytics-event";
  return "canonical-row";
}

function executionModeFor(
  owner: MutationSourceRef,
  family: MutationEffectFamily,
): MutationEffectExecutionMode {
  const key = `${owner.path}#${owner.symbol}`;
  if (/consumer|drain|worker|processQueued|reindex/i.test(key)) {
    return "asynchronous_from_durable_intent";
  }
  if (family === "analytics_event") return "best_effort_after_commit";
  if (family === "public_projection") return "conditional";
  return "required";
}

function effect(
  owner: MutationSourceRef,
  commitLabel: string,
  atomicity: MutationEffectAtomicity,
  effectFamilies: readonly MutationEffectFamily[],
  order: number,
  executionMode = executionModeFor(owner, effectFamilies[0]!),
): MutationEffectTrace {
  return {
    ownerPath: owner.path,
    ownerSymbol: owner.symbol,
    commitLabel,
    atomicity,
    effectFamilies: sorted(new Set(effectFamilies)) as MutationEffectFamily[],
    executionMode,
    evidencePaths: [owner.path],
    order,
  };
}

function terminalCallName(expression: ts.LeftHandSideExpression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function isMutatingSqlTemplate(
  node: ts.TaggedTemplateExpression,
  sourceFile: ts.SourceFile,
): boolean {
  const tag = node.tag.getText(sourceFile);
  if (!/^sql(?:<[^>]+>)?$/.test(tag)) return false;
  const text = node.template.getText(sourceFile);
  return (
    /\b(?:delete\s+from|insert\s+into|update\s+[a-z_])/i.test(text) ||
    /\bovergarden_(?:claim|create|delete|erase|merge|promote|rename|resolve|revoke|set|update)_[a-z0-9_]*\s*\(/i.test(
      text,
    )
  );
}

function findTransactionScopes(
  calls: readonly ts.CallExpression[],
  sourceFile: ts.SourceFile,
): TransactionScope[] {
  const scopes: TransactionScope[] = [];
  for (const call of calls) {
    const isDatabaseTransaction =
      terminalCallName(call.expression) === "execute" &&
      ts.isPropertyAccessExpression(call.expression) &&
      /\.transaction\s*\(\s*\)$/.test(
        call.expression.expression.getText(sourceFile),
      );
    const mode = call.arguments[0];
    const isBrowserStorageTransaction =
      terminalCallName(call.expression) === "transaction" &&
      mode !== undefined &&
      ts.isStringLiteralLike(mode) &&
      /^rw!?$/.test(mode.text);
    if (!isDatabaseTransaction && !isBrowserStorageTransaction) continue;
    const callback = isDatabaseTransaction
      ? call.arguments[0]
      : call.arguments.at(-1);
    if (
      !callback ||
      (!ts.isArrowFunction(callback) && !ts.isFunctionExpression(callback)) ||
      !callback.body
    ) {
      continue;
    }
    const ordinal = scopes.length + 1;
    const parameter = callback.parameters[0]?.name;
    scopes.push({
      id: `transaction:${ordinal}:${call.getStart(sourceFile)}`,
      kind: isDatabaseTransaction ? "database" : "browser_storage",
      ordinal,
      callStart: call.getStart(sourceFile),
      bodyStart: callback.body.getStart(sourceFile),
      bodyEnd: callback.body.getEnd(),
      executorParameter:
        parameter && ts.isIdentifier(parameter) ? parameter.text : null,
    });
  }
  return scopes;
}

function innermostTransactionScope(
  scopes: readonly TransactionScope[],
  position: number,
): TransactionScope | null {
  return (
    [...scopes]
      .filter(
        (scope) => position >= scope.bodyStart && position < scope.bodyEnd,
      )
      .sort(
        (left, right) =>
          right.bodyStart - left.bodyStart || left.bodyEnd - right.bodyEnd,
      )[0] ?? null
  );
}

function isTransactionExecutorCall(
  call: ts.CallExpression,
  executorParameter: string | null,
  sourceFile: ts.SourceFile,
): boolean {
  if (!executorParameter) return false;
  return new RegExp(`\\b${escapeRegExp(executorParameter)}\\b`).test(
    call.expression.getText(sourceFile),
  );
}

function callPassesExecutor(
  call: ts.CallExpression,
  executorParameter: string | null,
): boolean {
  if (!executorParameter) return false;
  const executorPattern = new RegExp(
    `\\b${escapeRegExp(executorParameter)}\\b`,
  );
  return call.arguments.some((argument) =>
    executorPattern.test(argument.getText()),
  );
}

function isCoCommittableDatabaseEffect(
  effectTrace: MutationEffectTrace,
): boolean {
  return (
    effectTrace.atomicity === "database_transaction" &&
    effectTrace.effectFamilies.every(
      (family) =>
        family === "canonical_row" || family === "transactional_outbox",
    )
  );
}

function isBrowserStorageEffect(effectTrace: MutationEffectTrace): boolean {
  return (
    effectTrace.atomicity === "browser_storage_transaction" &&
    effectTrace.effectFamilies.length === 1 &&
    effectTrace.effectFamilies[0] === "browser_storage"
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enclosingFunctionSymbol(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (
      (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) &&
      current.parent &&
      ts.isVariableDeclaration(current.parent) &&
      ts.isIdentifier(current.parent.name)
    ) {
      return current.parent.name.text;
    }
    current = current.parent;
  }
  return null;
}

function hasDefaultModifier(node: ts.Node): boolean {
  return Boolean(
    ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Default,
  );
}

function mergeEffects(
  effects: readonly MutationEffectTrace[],
): MutationEffectTrace[] {
  const merged = new Map<string, MutationEffectTrace>();
  for (const candidate of effects) {
    const key = effectIdentity(candidate);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...candidate,
        effectFamilies: sorted(new Set(candidate.effectFamilies)) as MutationEffectFamily[],
        evidencePaths: sorted(new Set(candidate.evidencePaths)),
      });
      continue;
    }
    merged.set(key, {
      ...existing,
      effectFamilies: sorted(
        new Set([...existing.effectFamilies, ...candidate.effectFamilies]),
      ) as MutationEffectFamily[],
      evidencePaths: sorted(
        new Set([...existing.evidencePaths, ...candidate.evidencePaths]),
      ),
      order: Math.min(existing.order, candidate.order),
    });
  }
  return [...merged.values()].sort(
    (left, right) =>
      left.order - right.order ||
      byteCompare(effectIdentity(left), effectIdentity(right)),
  );
}

function effectIdentity(effectTrace: MutationEffectTrace): string {
  return `${effectTrace.ownerPath}#${effectTrace.ownerSymbol}\0${effectTrace.commitLabel}\0${effectTrace.atomicity}`;
}

function deduplicateBindings(
  bindings: readonly MutationAdmissionBinding[],
): MutationAdmissionBinding[] {
  const byAdmission = new Map<string, MutationAdmissionBinding>();
  for (const binding of bindings) {
    const key = binding.admission
      ? `ref:${refKey(binding.admission)}`
      : binding.route
        ? `route:${binding.route.method}:${binding.route.url}`
        : "invalid";
    const current = byAdmission.get(key);
    byAdmission.set(key, {
      admission: binding.admission,
      route: binding.route,
      evidencePaths: sorted(
        new Set([
          ...(current?.evidencePaths ?? []),
          ...binding.evidencePaths,
        ]),
      ),
    });
  }
  return [...byAdmission.values()].sort((left, right) =>
    byteCompare(bindingKey(left), bindingKey(right)),
  );
}

function bindingKey(binding: MutationAdmissionBinding): string {
  if (binding.admission) return `ref:${refKey(binding.admission)}`;
  if (binding.route) return `route:${binding.route.method}:${binding.route.url}`;
  return "invalid";
}

function refKey(ref: MutationSourceRef): string {
  return `${normalizeRepositoryPath(ref.path)}#${ref.symbol}`;
}

function isSimpleIdentifier(value: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(value);
}

function normalizeRepositoryPath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function scriptKindForPath(repositoryPath: string): ts.ScriptKind {
  if (/\.tsx$/i.test(repositoryPath)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(repositoryPath)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/i.test(repositoryPath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function sorted<T extends string>(values: ReadonlySet<T>): T[] {
  return [...values].sort(byteCompare);
}

function byteCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
