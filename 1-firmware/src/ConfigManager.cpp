#include "ConfigManager.h"
#include <EEPROM.h>
#include "Config.h"

static bool eepromIsEmpty()
{
    for (size_t i = 0; i < CFG_EEPROM_SIZE; ++i)
        if (EEPROM.read(CFG_EEPROM_ADDR + i) != 0xFF)
            return false;
    return true;
}

void ConfigManager::begin()
{
    EEPROM.begin();
    if (eepromIsEmpty())
    {
        resetConfigToDefaults();
        saveConfig();
    }
    else
    {
        loadConfig();
    }
    // in setup(), right after ConfigManager.begin():
    float jm = ConfigManager::instance().getParameter("joint4.jointMin", JOINT_CONFIG[3].jointMin);
    float jM = ConfigManager::instance().getParameter("joint4.jointMax", JOINT_CONFIG[3].jointMax);
    float hOff = ConfigManager::instance().getParameter("joint4.homeOffset", JOINT_CONFIG[3].homeOffset);
}

void ConfigManager::loadConfig()
{
    char buf[CFG_EEPROM_SIZE + 1];
    for (size_t i = 0; i < CFG_EEPROM_SIZE; ++i)
        buf[i] = EEPROM.read(CFG_EEPROM_ADDR + i);
    buf[CFG_EEPROM_SIZE] = '\0';
    if (deserializeJson(_doc, buf))
    {
        resetConfigToDefaults();
        saveConfig();
    }
}

void ConfigManager::saveConfig()
{
    char buf[CFG_EEPROM_SIZE];
    size_t n = serializeJson(_doc, buf, CFG_EEPROM_SIZE);
    for (size_t i = 0; i < CFG_EEPROM_SIZE; ++i)
    {
        EEPROM.write(CFG_EEPROM_ADDR + i, (i < n) ? buf[i] : 0xFF);
    }
}

void ConfigManager::resetConfigToDefaults()
{
    _doc.clear();
    for (size_t i = 0; i < CONFIG_JOINT_COUNT; ++i)
    {
        char key[32];

        // positionFactor
        snprintf(key, sizeof(key), "joint%u.positionFactor", unsigned(i + 1));
        _doc[key] = JOINT_CONFIG[i].positionFactor;
        // maxAcceleration
        snprintf(key, sizeof(key), "joint%u.maxAccel", unsigned(i + 1));
        _doc[key] = JOINT_CONFIG[i].maxAcceleration;
        // maxJointSpeed
        snprintf(key, sizeof(key), "joint%u.maxSpeed", unsigned(i + 1));
        _doc[key] = JOINT_CONFIG[i].maxJointSpeed;
        // homingSpeed
        snprintf(key, sizeof(key), "joint%u.homingSpeed", unsigned(i + 1));
        _doc[key] = JOINT_CONFIG[i].homingSpeed;
        // slowHomingSpeed
        snprintf(key, sizeof(key), "joint%u.slowHomingSpeed", unsigned(i + 1));
        _doc[key] = JOINT_CONFIG[i].slowHomingSpeed;
        // jointMin
        snprintf(key, sizeof(key), "joint%u.jointMin", unsigned(i + 1));
        _doc[key] = JOINT_CONFIG[i].jointMin;
        // jointMax
        snprintf(key, sizeof(key), "joint%u.jointMax", unsigned(i + 1));
        _doc[key] = JOINT_CONFIG[i].jointMax;
        // homeOffset
        snprintf(key, sizeof(key), "joint%u.homeOffset", unsigned(i + 1));
        _doc[key] = JOINT_CONFIG[i].homeOffset;
    }
}

void ConfigManager::setParameter(const char *key, float value)
{
    _doc[key] = value;
}

float ConfigManager::getParameter(const char *key, float defaultValue) const
{
    auto v = _doc[key];
    return v.is<float>() ? v.as<float>() : defaultValue;
}

JsonDocument &ConfigManager::getFullConfig()
{
    return _doc;
}

void ConfigManager::saveJointPositions(const float *positions, size_t count) {
    size_t addr = CFG_JOINT_EEPROM_ADDR;
    for (size_t i = 0; i < count; ++i) {
        const uint8_t *p = reinterpret_cast<const uint8_t*>(&positions[i]);
        for (size_t b = 0; b < sizeof(float); ++b) {
            EEPROM.write(addr++, p[b]);
        }
    }
}

void ConfigManager::loadJointPositions(float *outPositions, size_t count) {
    size_t addr = CFG_JOINT_EEPROM_ADDR;
    for (size_t i = 0; i < count; ++i) {
        float v = 0;
        uint8_t *p = reinterpret_cast<uint8_t*>(&v);
        for (size_t b = 0; b < sizeof(float); ++b) {
            p[b] = EEPROM.read(addr++);
        }
        outPositions[i] = v;
    }
}
