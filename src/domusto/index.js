let schedule = require('node-schedule');
let fs = require('fs');
var SunCalc = require('suncalc');
let util = require('../util');
let core = require('../core.js');

let io;

let Domusto = {};

Domusto.io = null;

Domusto.outputDevices = [];
Domusto.inputDevices = [];

Domusto.devices = {};

Domusto.hardwareInstances = {};

Domusto.init = function (io) {

    Domusto.loadConfiguration();

    Domusto.io = io;

    Domusto.initSocketIo();

    Domusto.initHardware();

    Domusto.initDevices();

}

/**
 * Initialises Socket.io
 * @param {socket.io server} io The server instance of Socket.io
 */

Domusto.initSocketIo = function (io) {

    Domusto.io.on('connection', function (socket) {

        util.debug('DOMUSTO client connected from:', socket.handshake.headers.referer);

        // Update the client with the latest known states / data
        socket.emit('inputDeviceUpdate', Domusto.getDevicesByRole('input'));
        socket.emit('outputDeviceUpdate', Domusto.getDevicesByRole('output'));

        // // send data to client
        // setInterval(function () {
        //     console.log('emit');
        //     Domusto.io.emit('deviceUpdate', { 'id': 'input-2', 'number': Math.random() });
        // }, 10000);

    });

}

/**
 * Initialises configured hardware
 */
Domusto.initHardware = function () {

    util.debug('Initialising hardware');

    let hardware = Domusto.configuration.hardware;
    let hardwareInstance = null;

    // Loading hardware plugins
    for (let i = 0; i < hardware.length; i++) {

        let hardwareComponent = hardware[i];

        switch (hardwareComponent.type) {
            case "RFXCOM":
                hardwareInstance = require('../plugins/domusto-rfxcom');
                break;
            case "P1":
                hardwareInstance = require('../plugins/domusto-p1');
                break;

            default:
                break;
        }

        if (hardwareInstance) {
            hardwareInstance.init(hardwareComponent, Domusto.configuration);
            Domusto.hardwareInstances[hardwareComponent.type] = hardwareInstance;
            // Subscribe to the new input data function
            hardwareInstance.onNewInputData = Domusto.onNewInputData;
        }

    }

}

/**
 * Initialises configured devices
 */
Domusto.initDevices = function () {

    for (let i = 0; i < Domusto.configuration.devices.length; i++) {

        let device = Domusto.configuration.devices[i];

        if (device.enabled) {

            switch (device.role) {
                case 'input': {
                    let input = Domusto.initInput(Object.assign({}, device));
                    Domusto.devices[input.id] = input;

                    let hardwareId = input.protocol.hardwareId;
                    let hardwareComponent = Domusto.hardwareByHardwareId(hardwareId);
                    hardwareComponent.registerDevice(input);
                    break
                }
                case 'output': {
                    let output = Domusto.initOutput(Object.assign({}, device));
                    Domusto.devices[output.id] = output;

                    // Initialise timers when specified
                    if (output.timers) {
                        Domusto.initTimers(output);
                    }

                    break
                }

            }
        }
    }

}

/**
 * Schedules a timer according to sunset, sunrise etc
 * @param {object} device The device who executes the command
 * @param {object} timer The timer object which contains the timer information
 */
Domusto.scheduleSunTimer = function (device, timer) {

    var _device = device;
    var _timer = timer;

    let times = SunCalc.getTimes(new Date(), Domusto.configuration.location.latitude, Domusto.configuration.location.longitude);
    let date = util.offsetDate(times[_timer.condition], _timer.offset);

    util.log('Timer (sun) set for', _device.id, 'state', _timer.state, 'at', date);

    schedule.scheduleJob(date, function () {
        util.log('Timer activated for', _device.id, 'state', _timer.state);
        Domusto.outputCommand(_device.id, _timer.state);

        // Reschedule for next day
        Domusto.scheduleSunTimer(_device, _timer);
    });

}

Domusto.initTimers = function (device) {

    var _device = device;

    device.timers.forEach(function (timer) {

        if (timer.enabled) {

            _device.hasTimers = true;

            switch (timer.type) {

                case 'time':
                    util.log('Timer (timed) set for', _device.id, 'state', timer.state, 'at', timer.time);

                    schedule.scheduleJob(timer.time, function () {
                        util.log('Timer activated for', _device.id, 'state', timer.state);
                        Domusto.outputCommand(_device.id, timer.state);
                    });
                    break;

                case 'sun':
                    Domusto.scheduleSunTimer(_device, timer);
                    break;

            }

        } else {
            util.log('Timer disabled for', timer.time, 'state', timer.state, '-> Set enabled to true to enable');
        }

    }, this);

};

/**
 * Initialises an input device with its default DOMUSTO device properties
 * @param {object} input Input device object from configuration
 */
Domusto.initInput = function (input) {

    switch (input.type) {
        case 'temperature': {

            input.data = {
                deviceTypeString: null,
                temperature: null,
                humidity: null,
                humidityStatus: null,
                barometer: null,
                batteryLevel: null,
                rssi: null,
            }
            input.lastUpdated = new Date()
            break;
        }
        case 'power': {

            input.data = {
                electricity: {
                    received: {
                        tariff1: {
                            value: null,
                            unit: 'kW'
                        },
                        tariff2: {
                            value: null,
                            unit: 'kWh'
                        },
                        actual: {
                            value: null,
                            unit: 'kWh'
                        }
                    }
                }
            }
            input.lastUpdated = new Date()
            break;
        }
    }

    return input;
}

/**
 * Initialises an output device with its default DOMUSTO device properties
 * @param {object} output Output device object from configuration
 */
Domusto.initOutput = function (output) {
    output.state = 'off';
    output.hasTimers = false;
    output.lastUpdated = new Date();
    output.actions = {
        on: core.data.serverAddress + 'output/command/' + output.id + '/on',
        off: core.data.serverAddress + 'output/command/' + output.id + '/off'
    }

    return output;
}

/**
 * Sends an output command to the hardware of an output device
 * @param {string} deviceId Id of the device
 * @param {string} command Command to send
 * @param {function} onSucces Fired when the command is successfully executed
 */
Domusto.outputCommand = function (deviceId, command, onSuccess) {

    let device = Domusto.devices[deviceId];
    let hardware = Domusto.hardwareByHardwareId(device.protocol.hardwareId);

    hardware.outputCommand(device, command, function (response) {
        device.state = response.state;
        device.lastUpdated = new Date();

        // check if a callback is provided
        if (typeof onSucces === 'function') {
            onSuccess(device);
        }

        // outputDeviceUpdate channel only takes arrays
        let devices = [];
        devices.push(device);
        Domusto.io.emit('outputDeviceUpdate', devices);
    });

}

/**
 * Fired when a plugin broadcasts new data
 * @param {object} input Input device object
 */
Domusto.onNewInputData = function (input) {

    let device = Domusto.deviceByHardwareId(input.hardwareId);

    // Check if the updated data comes from a registered device
    if (device) {

        switch (device.type) {
            case 'switch': {
                Domusto.outputCommand(device.id, input.command);
                break;
            }
            default:

                // Update the device with the new input data
                Object.assign(device.data, input.data);

                device.lastUpdated = new Date();

                // inputDeviceUpdate channel only takes arrays
                let devices = [];
                devices.push(device);
                Domusto.io.emit('inputDeviceUpdate', devices);

                break;
        }

    }

}

/*
 * Load the app / input / output configuration file
 */
Domusto.loadConfiguration = function () {
    let configuration = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
    Domusto.configuration = configuration;

    if (!Domusto.configuration.debug) {
        util.debug = function () { };
    } else {
        util.log('Debug messages enabled')
    }
}

// Get the hardware instance by device id
Domusto.hardwareByHardwareId = function (hardwareId) {
    return Domusto.hardwareInstances[hardwareId];
}

Domusto.deviceByHardwareId = function (hardwareId) {

    for (let i in Domusto.devices) {

        let device = Domusto.devices[i];

        if (device.protocol.id && (device.protocol.id === hardwareId)) {
            return device;
        }
    }

    for (let i in Domusto.devices) {

        let device = Domusto.devices[i];


        if (device.protocol.outputs && (device.protocol.outputs.id === hardwareId)) {
            return device;
        }
    }

    for (let i in Domusto.devices) {

        let device = Domusto.devices[i];

        if (device.protocol.inputs) {

            let device = Domusto.devices[i];

            for (let j in device.protocol.inputs) {

                if (device.protocol.inputs[j].id === hardwareId) {
                    return device;
                }

            }

        }
    }

    return null;
};

Domusto.getDevicesByRole = function (role) {

    let devices = [];

    for (let i in Domusto.devices) {

        let device = Domusto.devices[i];

        if (device.role === role) {
            devices.push(device);
        }
    }

    return devices;

}

module.exports = Domusto;