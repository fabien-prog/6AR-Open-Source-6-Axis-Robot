#ifndef CONFIG_MANAGER_H
#define CONFIG_MANAGER_H

#include <Arduino.h>
#include <ArduinoJson.h>
#include <EEPROM.h>

static constexpr size_t CFG_EEPROM_SIZE       = 4284;
static constexpr size_t CFG_EEPROM_ADDR       = 0;
/// right after your JSON region, stash N floats here:
static constexpr size_t CFG_JOINT_EEPROM_ADDR = CFG_EEPROM_ADDR + CFG_EEPROM_SIZE;

class ConfigManager {
public:
    static ConfigManager &instance() {
        static ConfigManager inst;
        return inst;
    }

    void begin();
    void loadConfig();
    void saveConfig();
    void resetConfigToDefaults();
    void setParameter(const char *key, float value);
    float getParameter(const char *key, float defaultValue = 0.0f) const;
    JsonDocument &getFullConfig();

 /// Write `count` floats from `positions[]` into EEPROM.
    void saveJointPositions(const float *positions, size_t count);

    /// Read `count` floats out of EEPROM into `outPositions[]`.
    void loadJointPositions(float *outPositions, size_t count);

private:
    ConfigManager() = default;
    DynamicJsonDocument _doc{CFG_EEPROM_SIZE};
};

#endif // CONFIG_MANAGER_H
