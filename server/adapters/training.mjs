export class RuleTrainingEngine {
  constructor(core) { this.core = core; this.modelVersion = core.MODEL_VERSION }
  evaluate(state, today) { return this.core.dashboard(state, today) }
}
