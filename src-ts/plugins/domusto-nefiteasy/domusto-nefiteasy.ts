import util from '../../util';
import config from '../../config';
import DomustoPlugin from '../../domusto/DomustoPlugin';

import * as NefitEasyClient from 'nefit-easy-commands';

/**
 * Nefit Easy plugin for DOMUSTO
 * @author Marthijn van den Heuvel
 * @version 0.0.1
 *
 * @class DomustoNefitEasy
 * @extends {DomustoPlugin}
 */
class DomustoNefitEasy extends DomustoPlugin {

    private _client: NefitEasyClient;

    /**
     * Creates an instance of DomustoNefitEasy.
     * @param {any} Plugin configuration as defined in the config.js file
     * @memberof DomustoNefitEasy
     */
    constructor(pluginConfiguration) {

        super({
            plugin: 'Nefit Easy',
            author: 'Marthijn van den Heuvel',
            category: 'heating',
            version: '0.0.1',
            website: 'http://domusto.com'
        });

        this.pluginConfiguration = pluginConfiguration;

        if (pluginConfiguration.dummyData) {

            setInterval(() => {

                let sensorData = this._getStatusDummyData();

                this.onNewInputData({
                    pluginId: this._pluginConfiguration.type,
                    deviceId: 'inHouseTemp',
                    data: {
                        deviceTypeString: 'Nefit Easy in house temperature',
                        temperature: sensorData.status['in house temp'],
                    }
                });

                this.onNewInputData({
                    pluginId: this._pluginConfiguration.type,
                    deviceId: 'outdoorTemp',
                    data: {
                        deviceTypeString: 'Nefit Easy outdoor temperature',
                        temperature: sensorData.status['outdoor temp'],
                    }
                });

            }, 10000);

        } else {

            this._client = NefitEasyClient({
                serialNumber: pluginConfiguration.settings.serialNumber,
                accessKey: pluginConfiguration.settings.accessKey,
                password: pluginConfiguration.settings.password
            });

            this._getStatus();

        }
    }

    // Nefit Easy commands documentation: https://github.com/robertklep/nefit-easy-commands
    _getStatus() {

        this._client.connect().then(() => {
            return [this._client.status(), this._client.pressure(), this._client.location()];
        }).spread((status, pressure, location) => {
            if (this.pluginConfiguration.debug) {
                util.prettyJson(status);
                util.prettyJson(pressure);
                util.prettyJson(location);
            }

            this._onNewInputData({
                pluginId: this._pluginConfiguration.type,
                data: {
                    status: status,
                    pressure: pressure,
                    location: location
                }
            });

        }).catch((e) => {
            util.error('Nefit Easy error', e);
        }).finally(() => {
            this._client.end();
        });

    }

    _getStatusDummyData() {
        return {
            status: {
                'user mode': 'clock',
                'clock program': 'auto',
                'in house status': 'ok',
                'in house temp': util.randomWithinOffset(19.2, 4),
                'hot water active': true,
                'boiler indicator': 'central heating',
                control: 'room',
                'temp override duration': 0,
                'current switchpoint': 37,
                'ps active': false,
                'powersave mode': false,
                'fp active': false,
                'fireplace mode': false,
                'temp override': false,
                'holiday mode': false,
                'boiler block': null,
                'boiler lock': null,
                'boiler maintenance': null,
                'temp setpoint': util.randomWithinOffset(19.5, 2),
                'temp override temp setpoint': 17,
                'temp manual setpoint': 19,
                'hed enabled': null,
                'hed device at home': null,
                'outdoor temp': util.randomWithinOffset(13, 5),
                'outdoor source type': 'virtual'
            },
            pressure: {
                pressure: util.randomWithinOffset(2, 0.05),
                unit: 'bar'
            },
            location: {
                lat: 52.197906,
                lng: 5.143669
            }
        };
    }
}
export default DomustoNefitEasy;