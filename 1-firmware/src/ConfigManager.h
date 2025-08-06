// ConfigManager.h
#ifndef CONFIG_MANAGER_H
#define CONFIG_MANAGER_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <EEPROM.h>
#include "Config.h"


static constexpr size_t CFG_EEPROM_SIZE = 4284;
static constexpr size_t CFG_EEPROM_ADDR = 0;
/// right after your JSON region, stash N floats here:
static constexpr size_t CFG_JOINT_EEPROM_ADDR = CFG_EEPROM_ADDR + CFG_EEPROM_SIZE;

class ConfigManager
{
public:
    static ConfigManager &instance()
    {
        static ConfigManager inst;
        return inst;
    }

    /// Call once in setup()
    void begin();
    /// Call every loop() to flush EEPROM if dirty
    void update();

    void loadConfig();
    void saveConfig();
    void resetConfigToDefaults();
    void setParameter(const char *key, float value);
    float getParameter(const char *key, float defaultValue = 0.0f) const;
    JsonDocument &getFullConfig();

    /// Write/read joint positions (unchanged)
    void saveJointPositions(const float *positions, size_t count);
    void loadJointPositions(float *outPositions, size_t count);

private:
    ConfigManager() = default;

    DynamicJsonDocument _doc{CFG_EEPROM_SIZE};

    // — NEW: batch EEPROM writes ——
    bool dirty = false;
    unsigned long lastDirtyMs = 0;
    static constexpr unsigned long SAVE_DELAY_MS = 1000; // 1 s after last change
};

#endif // CONFIG_MANAGER_H
