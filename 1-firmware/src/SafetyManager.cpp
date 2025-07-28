#include "SafetyManager.h"

SafetyManager &SafetyManager::instance()
{
  static SafetyManager inst;
  return inst;
}

SafetyManager::SafetyManager() = default;

void SafetyManager::begin()
{
  // configure red & yellow LEDs (active LOW)
  pinMode(RELAY_PINS[RED_LED_RELAY], OUTPUT);
  pinMode(RELAY_PINS[YELLOW_LED_RELAY], OUTPUT);
  // start with both off:
  digitalWrite(RELAY_PINS[RED_LED_RELAY], HIGH);
  digitalWrite(RELAY_PINS[YELLOW_LED_RELAY], HIGH);

  // E-stop is wired as INPUT_PULLUP → pressed = LOW
  pinMode(PIN_ESTOP, INPUT_PULLUP);
  // catch the press (HIGH→LOW)
  attachInterrupt(digitalPinToInterrupt(PIN_ESTOP),
                  SafetyManager::onEStopISR,
                  FALLING);

  setEstopCallbacks(
      []()
      { Serial.println(">> ESTOP ENTERED!"); },
      []()
      { Serial.println(">> ESTOP CLEARED"); });
}

void SafetyManager::onEStopISR()
{
  instance().enterEStop();
}

void SafetyManager::triggerEstop()
{
  enterEStop();
}

void SafetyManager::runChecks()
{
  if (!eStopped)
    return;

  // raw reading: pressed == LOW
  bool pressed = digitalRead(PIN_ESTOP) == HIGH;

  if (pressed)
  {
    // still held: blink red, keep yellow off
    handleBlink();
    digitalWrite(RELAY_PINS[YELLOW_LED_RELAY], HIGH);
  }
  else
  {
    // released: red solid off, yellow solid on
    digitalWrite(RELAY_PINS[RED_LED_RELAY], HIGH);
    digitalWrite(RELAY_PINS[YELLOW_LED_RELAY], LOW);
  }

  // reset condition: released + green button (idx 0) pressed
  if (!pressed && IOManager::instance().isDigitalActive(0))
  {
    exitEStop();
  }
}

void SafetyManager::enterEStop()
{
  if (eStopped)
    return;
  eStopped = true;

  // stop all motion immediately
  JointManager::instance().stopAll();
  CalibrationManager::instance().stopAllMotors();

  // notify host
  CommManager::instance().sendInputStatus();

  if (cbOnEnter)
    cbOnEnter();

  // start blinking red
  lastBlink = millis();
  ledState = false;

  // prevent retrigger until we explicitly reset
  detachInterrupt(digitalPinToInterrupt(PIN_ESTOP));
}

void SafetyManager::exitEStop()
{
  eStopped = false;

  // turn both LEDs off
  digitalWrite(RELAY_PINS[RED_LED_RELAY], HIGH);
  digitalWrite(RELAY_PINS[YELLOW_LED_RELAY], HIGH);

  // notify host
  CommManager::instance().sendInputStatus();

  if (cbOnExit)
    cbOnExit();

  // re-arm the E-stop interrupt
  attachInterrupt(digitalPinToInterrupt(PIN_ESTOP),
                  SafetyManager::onEStopISR,
                  FALLING);
}

void SafetyManager::handleBlink()
{
  unsigned long now = millis();
  if (now - lastBlink < BLINK_MS)
    return;
  lastBlink = now;
  ledState = !ledState;
  // active-LOW flash:
  digitalWrite(RELAY_PINS[RED_LED_RELAY],
               ledState ? LOW : HIGH);
}

// register your callbacks
void SafetyManager::setEstopCallbacks(std::function<void()> onEnter, std::function<void()> onExit)
{
  cbOnEnter = onEnter;
  cbOnExit = onExit;
}