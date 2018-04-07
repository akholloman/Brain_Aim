import { MuseClient, MUSE_SERVICE, channelNames } from 'muse-js';
import Ganglion from '../../ganglion-ble/dist/ganglion-ble.umd.js';

// Since Ganglion refuses to export their dervice id, it is copied here
const GANGLION_SERVICE = 0xfe84;

// Helper methods for functional style matching.
//   From -> https://codeburst.io/alternative-to-javascripts-switch-statement-with-a-functional-twist-3f572787ba1c
const matched = x => ({
	on: () => matched(x),
	otherwise: () => x,
});

const match = x => ({  
	on: (pred, fn) => (pred(x) ? matched(fn(x)) : match(x)),
	otherwise: fn => fn(x),
});

// Device enums for supported types and States
export enum DeviceType {
	NONE,
	MUSE,
	GANGLION
};

export enum DeviceState {
	CONNECTED,
	DISCONNECTED
}

// Scalp Electrode locations based on the International 10-20 System
//   https://en.wikipedia.org/wiki/10%E2%80%9320_system_(EEG)
export enum ScalpElectrodes {
	FP1, FP2,
	AF7, AF8,
	F7, F3, FZ, F4, F8,
	A1, T3, C3, CZ, C4, T4, A2,
	TP9, TP10,
	T5, P3, PZ, P4, T6,
	O1, O2
};

/** @class BCIDevice
 * A bluetooth device wrapper for botht the Muse headset and the OpenBCI Ganglion
 */
export class BCIDevice {
	// Device properties
	device: any;
	type: DeviceType;
	state: DeviceState;
	subscription: Function = () => {};
	dataHandler: Function = () => {};
	statusHandler: Function = () => {};

	// Sync Timer
	sync: {} = {};

	// Options
	sampleRate: number;
	sampleTime: number;
	
	// Initialize the device with supplied defaults
	constructor(dataHandler?: Function, statusHandler?: Function) {
		this.device = null;
		this.type = DeviceType.NONE;
		this.state = DeviceState.DISCONNECTED;

		if (dataHandler) this.dataHandler = dataHandler;
		if (statusHandler) this.statusHandler = statusHandler;

		// Initialize the sync map
		const keys = Object.keys(ScalpElectrodes).filter(k => typeof ScalpElectrodes[k as any] === "number");
		const values = keys.map(k => ScalpElectrodes[k as any]);
		values.forEach(val => {
			this.sync[val] = 0;
		});
	}

	async connect() {
		// Make sure there is not an attached, connected device
		if (this.device !== null && this.state === DeviceState.CONNECTED) 
			this.disconnect();

		// Request the device, filtered by name
		let dev = await navigator.bluetooth.requestDevice({
			filters: [
				{
					namePrefix: "Ganglion-"
				},
				{
					namePrefix: "Muse-"
				}
			],
			optionalServices: [MUSE_SERVICE, GANGLION_SERVICE]
		});

		// Quit out if any of the fields are false
		if (!dev || !dev.gatt || !dev.name) return;

		// Connect to the device
		const gatt = await dev.gatt.connect();
		this.state = DeviceState.CONNECTED;

		// Create the client by analyzing the name
		const self = this;
		await match(dev)
			.on(d => d.name.match(/^Muse-/), () => {
				self.type = DeviceType.MUSE;
				self.device = new MuseClient();

				// Map the sensors to their equivalent electrodes
				let sensors = {};
				sensors[channelNames.indexOf("TP9")]  = ScalpElectrodes.TP9;
				sensors[channelNames.indexOf("TP10")] = ScalpElectrodes.TP10;
				sensors[channelNames.indexOf("AF7")]  = ScalpElectrodes.AF7;
				sensors[channelNames.indexOf("AF8")]  = ScalpElectrodes.AF8;

				// Create the subscription container
				self.subscription = () => {
					self.device.eegReadings.subscribe(sample => {
						let electrode = sensors[sample.electrode];
						let delta = sample.timestamp - self.sync[electrode];

						this.dataHandler({data: sample.samples, electrode: electrode, sampleRate: 1000 / delta * sample.samples.length});
						self.sync[electrode] = sample.timestamp;
					});

					self.device.telemetryData.subscribe(status => {
						this.statusHandler(status);
					});
				}
			})
			.on(d => d.name.match(/^Ganglion-/), async () => {
				self.type = DeviceType.GANGLION;
				self.device = new Ganglion();

				// Map the sensors to their equivalent electrodes
				// TODO: Make this a configurable argument
				let sensors = {};
				sensors[0] = ScalpElectrodes.FP1;
				sensors[1] = ScalpElectrodes.FP2;
				sensors[2] = ScalpElectrodes.A1;
				sensors[3] = ScalpElectrodes.A2;

				self.subscription = () => {
					self.device.stream.subscribe(sample => {
						sample.data.forEach((val, ind) => {
							let electrode = sensors[ind];
							console.log("E:", electrode);
							let delta = sample.timestamp - self.sync[electrode];

							this.dataHandler({data: [val], electrode: electrode, sampleRate: 1000 / delta});
							self.sync[electrode] = sample.timestamp;
						});
					});
				}
			})
			.otherwise(d => {
				throw new Error("Unknown device! " + d.name);
			});
		
		// Connect the physical device to this device
		await this.device.connect(gatt);
		await this.device.start();

		// Subscribe to the data
		this.subscription();
	}

	// Disconnect the device
	disconnect() {
		if (this.state === DeviceState.DISCONNECTED) return;

		this.device.disconnect();
		this.state = DeviceState.DISCONNECTED;
	}

	// TODO: Allow for multiple susbscriptions
	subscribe(callback: Function) {
		this.dataHandler = callback;
	}

	static electrodeIndex(str: string) {
		return ScalpElectrodes[str];
	}
}