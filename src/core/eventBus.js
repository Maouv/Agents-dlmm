const EventEmitter = require('events');
const logger = require('../utils/logger');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Increase for multiple agents
  }

  emit(event, data) {
    logger.debug(`Event emitted: ${event}`, data);
    return super.emit(event, data);
  }

  on(event, listener) {
    logger.debug(`Listener registered for: ${event}`);
    return super.on(event, listener);
  }
}

module.exports = new EventBus();
