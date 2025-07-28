#include "HelperManager.h"
#include <EEPROM.h>
#include "Config.h"
#include "JointManager.h"
#include "ConfigManager.h"

// Cortex-AIRCR reset key + SYSRESETREQ bit
#define AIRCR_VECTKEY_MASK (0x05FA0000)
#define AIRCR_SYSRESETREQ (1U << 2)

HelperManager &HelperManager::instance()
{
    static HelperManager inst;
    return inst;
}

void HelperManager::begin()
{
    EEPROM.begin();
    Serial.println("[HelperManager] ready");
}

void HelperManager::restart()
{
    // 1) grab all current joint angles
    float pos[CONFIG_JOINT_COUNT];
    for (size_t j = 0; j < CONFIG_JOINT_COUNT; ++j)
    {
        pos[j] = JointManager::instance().getPosition(j);
    }

    // 2) persist them right after the JSON region in EEPROM
    ConfigManager::instance().saveJointPositions(pos, CONFIG_JOINT_COUNT);

    // 3) let any pending Serial prints flush
    delay(100);

    // 4) trigger a full system reset by writing AIRCR
    SCB_AIRCR = AIRCR_VECTKEY_MASK | AIRCR_SYSRESETREQ;

    // should never return
    while (1)
    {
    }
}
