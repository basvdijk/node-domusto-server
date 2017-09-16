# Nefit Easy

```
plugin:    Nefit Easy
author:    Marthijn van den Heuvel
           Bas van Dijk
category:  heating
version:   0.0.1
website:   http://domusto.com
```

## Hardware needed
- Nefit ModuLine Easy thermostat

## Example device configuration

```js

// For in house temperature
{
    id: 'TEMP9',
    enabled: true,
    role: 'input',
    name: 'NEFIT in house',
    type: 'temperature',
    subType: 'temperature',
    protocol: {
        pluginId: 'NEFITEASY',
        id: 'inHouseTemp'
    }
},

// For outdoor temperature
{
    id: 'TEMP10',
    enabled: true,
    role: 'input',
    name: 'NEFIT outdoor',
    type: 'temperature',
    subType: 'temperature',
    protocol: {
        pluginId: 'NEFITEASY',
        id: 'outdoorTemp'
    }
},
```