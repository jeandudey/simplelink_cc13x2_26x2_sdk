/*
 * Copyright (c) 2018-2019, Texas Instruments Incorporated - http://www.ti.com
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * *  Redistributions of source code must retain the above copyright
 *    notice, this list of conditions and the following disclaimer.
 *
 * *  Redistributions in binary form must reproduce the above copyright
 *    notice, this list of conditions and the following disclaimer in the
 *    documentation and/or other materials provided with the distribution.
 *
 * *  Neither the name of Texas Instruments Incorporated nor the names of
 *    its contributors may be used to endorse or promote products derived
 *    from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
 * THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
 * PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 * EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 */

/*
 *  ======== rfdriver.syscfg.js ========
 */

"use strict";

/* Common /ti/drivers utility functions */
const Common = system.getScript("/ti/drivers/Common.js");

/* Device and board information */
let deviceData = system.deviceData;
let isCustomDesign = !("board" in deviceData);

/* Code generation */
const SYM_PREFIX = "CONFIG_RF_";

/* User info message */
const userMessage = "The RF Driver callback function must be implemented by the user.";

/* Cache of selected RF pins */
let rfPins = [];

/* Array of pin options */
const pinOpt = getPinOptions();

const intPriority = Common.newIntPri()[0];
intPriority.name = "interruptPriority";
intPriority.displayName = "Interrupt Priority";
intPriority.description = "RF peripheral hardware interrupt priority";

const swiPriority = Common.newSwiPri();
swiPriority.name = "softwareInterruptPriority";
swiPriority.displayName = "Software Interrupt Priority";
swiPriority.description = "RF driver software interrupt priority";

/*
 *  ======== devSpecific ========
 *  Device-specific extensions to be added to base PIN1 configuration
 */
const rfdriver = {
    moduleStatic: {
        config: [
            intPriority,
            swiPriority,
            {
                name: "xoscNeeded",
                displayName: "XOSC Needed",
                description: "Specify if the High Frequency Crystal Oscillator"
                    + " (XOSC-HF) shall always be started by the Power driver.",
                longDescription:`
When __true__, the power driver always starts the XOSC-HF. When __false__, the RF
driver will request the XOSC-HF if needed.
`,
                default: true
            },
            {
                name: "globalEventMask",
                displayName: "Global Event Mask",
                description: "Sets global RF driver events",
                longDescription: `
This specifies a mask of global events which the __Global Callback Function__
is invoked upon.
`,
                minSelections: 0,
                default: [],
                onChange: onEventMaskChanged,
                options: [
                    {
                        name: "RF_GlobalEventRadioSetup",
                        description: "Global event triggered when the RF core"
                            + " is being reconfigured through a setup."
                    },
                    {
                        name: "RF_GlobalEventRadioPowerDown",
                        description: "Global event triggered when the RF core"
                            + " is being powered down."
                    }
                ]
            },
            {
                name: "globalCallbackFunction",
                displayName: "Global Callback Function",
                longDescription: `
The RF driver serves additional global, client independent events by invoking
the __Global Callback Function__. If the board has antenna switches, a
default callback (rfDriverCallback) is provided. By setting the
__Global Callback Function__ to __NULL__, the default callback, if it exists,
will be registered.

Global events triggering this callback can be configured through the
__Global Event Mask__ configuration.
`,
                default: "NULL",
                readOnly: true
            },
            {
                name: "pinSelection",
                displayName: "RF Pin Selection",
                description: "Selects which pins are used by RF frontend",
                minSelections: 0,
                hidden: !pinOpt.visible,
                default: [],
                options: pinOpt.options,
                onChange: onPinConfigChanged
            }
        ],
        validate: validate,
        filterHardware: filterHardware,
        onHardwareChanged: onHardwareChanged,
        pinmuxRequirements: pinmuxRequirements,

        moduleInstances: moduleInstances,
        modules: Common.autoForceModules(["Board", "Power"]),
    },
    isCustomDesign: function()
    {
        return isCustomDesign;
    },
    getRfPins: function()
    {
        return rfPins;
    },
    userMessage: userMessage,

    /* override device-specific templates */
    templates: {
        boardc: "/ti/drivers/rf/rfdriver.c.xdt",
        boardh: "/ti/drivers/rf/rfdriver.h.xdt"
    },
};

/*
 *  ======== addPinSymbolConfigurables ========
 *  Add a configurable for each pin that allows the user to choose
 *  a symbol for the pin.
 */
function addPinSymbolConfigurables() {
    /* Group containing the pin symbols */
    const pinSymGroup = {
        displayName: "RF Pin Symbols",
        collapsed: false,
        config: []
    };

    _.each(pinOpt.options, (opt) => {
        const name = opt.name;
        const num = opt.name.replace("DIO_", "");
        const pinSymCfg = {
            name: name,
            displayName: name,
            default: SYM_PREFIX + "DIO" + num,
            hidden: true
        };
        pinSymGroup.config.push(pinSymCfg);
    });

    /* Add to the the module's configurables */
    rfdriver.moduleStatic.config.push(pinSymGroup);
}

/*
*  ======== getPinByName ========
*  Find a pin description by IOID
*/
function getPinByName(ioid) {
    let ipin = null;

    _.each(deviceData.devicePins, (pin) => {
        const name = pin.designSignalName;
        if (name === ioid) {
            ipin = pin;
            return false;
        }
    });
    if (ipin === null) {
        throw Error("Pin not found: " + ioid);
    }
    return ipin;
}


/*
 *  ======== getPinOptions ========
 *  Get a list of pins that are possible to use for
 *  RF frontend configuration.
 */
function getPinOptions() {
    let pincfg = {
        visible: false,
        options: []
    };

    _.each(deviceData.devicePins, (pin) => {
        const name = pin.designSignalName;
        if (name.includes("DIO_")) {
            const opt = {
                name: name,
                displayName: name,
                description: "Test",
            };
            pincfg.options.push(opt);
        }
    });
    pincfg.visible = true

    return pincfg;
}

/*
 *  ======== onPinConfigChanged ========
 *  Called when a custom pin configuration changes
 */
function onPinConfigChanged(inst, ui) {
    /* Update the pin selection */
    updatePinList(inst);

    /* Update visibility of pin symbol configurables */
    updatePinVisibility(inst, ui);

    /* Update other configurables */
    if (inst.pinSelection.length > 0) {
        inst.globalCallbackFunction = "rfDriverCallbackCustom";
        inst.globalEventMask = [
            "RF_GlobalEventRadioSetup",
            "RF_GlobalEventRadioPowerDown"];
    } else {
        inst.globalCallbackFunction = "NULL";
        inst.globalEventMask = [];
    }
    onEventMaskChanged(inst, ui);
}

/*
 *  ======== onEventMaskChanged ========
 *  Called when the event mask changes
 */
function onEventMaskChanged(inst, ui) {
    ui.globalCallbackFunction.readOnly = inst.globalEventMask.length === 0;
}

/*!
 * ======== updatePinList ========
 * Update the list of used pins
 *
 * @param inst - RF Frontend instance
 */
function updatePinList(inst) {
    /* Update pin list */
    rfPins = [];
    _.each(inst.pinSelection, (ioid) => {
        const ps = getPinByName(ioid);
        let name = ioid;
        if (ioid in inst) {
            // User configurable symbol
            name = inst[ioid];
        }
        const pin = {
            name: name,
            ioid: ioid,
            ball: ps.ball
        };
        rfPins.push(pin);
    });
}

/*
 *  ======== updateDeviceData ========
 *  Device data/board info may change dynamically ("Custom Board" button)
 */
function updateDeviceData() {
    const hadBoard = !isCustomDesign;
    const hasBoard = "board" in deviceData;
    if (hadBoard && !hasBoard) {
        deviceData = system.deviceData;
        isCustomDesign = !hasBoard;
        console.log("Board removed");
    }
}

/*!
 * ======== updatePinVisibility ========
 * Update the visibility if the pin symbol configuration
 *
 * @param inst - RF Frontend instance
 * @param ui - UI state object
 */
function updatePinVisibility(inst, ui) {
    /* First hide all pins */
    _.each(pinOpt.options, (opt) => {
        const ioid = opt.name;
        ui[ioid].hidden = true;
    });
    const hasHardware = inst.$hardware != null;

    /* Show selected pins */
    _.each(inst.pinSelection, (ioid) => {
         ui[ioid].hidden = false;
         ui[ioid].readOnly = hasHardware;
    });
}


/*!
 *  ======== filterRFPin ========
 */
function filterRFPin(devicePin, peripheralPin)
{
    const ioid = devicePin.designSignalName;

    for (let i = 0; i < rfPins.length; i++) {
        if (rfPins[i].ioid === ioid) {
            return true;
        }
    }

    return isCustomDesign; 
}


/*!
 *  ======== pinmuxRequirements ========
 *  Return peripheral pin requirements as a function of config
 */
function pinmuxRequirements(inst)
{
    let rfArray = [];
    for (let i = 0; i < inst.pinSelection.length; i++) {
        rfArray[i] = {
            name: "rfAntennaPin" + i,
            displayName: "RF Antenna Pin",
            hidden: false,
            interfaceName: "GPIO",
            signalTypes: ["RF"],
            filter: filterRFPin
        };
    }
    return rfArray;
}


/*!
 *  ======== onHardwareChange ========
 */
function onHardwareChanged(inst, ui)
{
    const hasHardware = inst.$hardware != null;

    ui.pinSelection.hidden = hasHardware;
    
    if (hasHardware) {
        inst.pinSelection = [];
        const component = inst.$hardware;
        let hwPins = [];

        inst.globalCallbackFunction = "rfDriverCallback";
        inst.globalEventMask = [
            "RF_GlobalEventRadioSetup",
            "RF_GlobalEventRadioPowerDown"];

        for (let sig in component.signals) {
            /* Build up array of pins */
            const sigObj = component.signals[sig];

            /* Use the IOID name of the pin, e.g., "IOID_30"  */
            const dio = sigObj.devicePin.description;
            const name = sigObj.name;

            /* Update symbol name */
            inst[dio] = SYM_PREFIX + name;

            /* Insert DIO in list of selected pins */
            hwPins.push(dio);
        }
        inst.pinSelection = hwPins;
    }
    else {
        inst.globalCallbackFunction = "NULL";
        inst.globalEventMask = [];
    }

    /* Update UI state */
    updatePinList(inst);
    updatePinVisibility(inst, ui);
}

/*!
 *  ======== filterHardware ========
 *  component - a hardware component
 *
 *  Use this function to get the pins used by the RF antenna.
 */
function filterHardware(component)
{
    /*
     *  Check for an "RF" component in the board file.  If there is an
     *  RF component, collect the pins so we can pass them to the PIN
     *  module.
     */
    if (Common.typeMatches(component.type, ["RF"])) {
        return true;
    }
    return false;
}


/*!
 *  ======== validate ========
 *  Validate RF module's configuration
 */
function validate(inst, validation)
{
    /* check that globalCallbackFunction is a C identifier */
    const callbackFn = inst.globalCallbackFunction;
    if (!Common.isCName(callbackFn)) {
        Common.logError(validation, inst, "globalCallbackFunction",
            "'" + callbackFn + "' is not a valid a C identifier");
    }

    if (!inst.$hardware) {
        if (callbackFn !== "NULL") {
            /* notify user that the globalCallbackFunction must be implemented */
            Common.logInfo(validation, inst, "globalCallbackFunction", userMessage);
        }
    }

    /* verify that there are no pin name conflicts */
    const pinNames = {};
    const pinIDs = inst.pinSelection;
    for (const i in pinIDs) {
        const pinID = pinIDs[i];
        const pinName = inst[pinID];
        if (pinName in pinNames) {
            Common.logError(validation, inst, pinID, "Conflicting PIN names");
        }
        else {
            pinNames[pinName] = pinID;
        }
    }
}

/*!
 *  ======== moduleInstances ========
 *  returns an array of PIN instances
 */
function moduleInstances(inst)
{
    updateDeviceData();
    updatePinList(inst);

    let pinInstance = new Array();
    let signals;
    const hasHardware = inst.$hardware;

    if (hasHardware) {
        signals = inst.$hardware.signals;
    } else {
        signals = rfPins;
    }

    let i = 0;
    for (let sig in signals) {
        const sigObj = signals[sig];
        /* Use the IOID name of the pin, e.g., "IOID_30"  */
        let io;
        let name;

        if (hasHardware) {
            io = sigObj.devicePin.description.replace("DIO", "IOID");
            name = SYM_PREFIX + sigObj.name;
        } else {
            io = sigObj.ioid.replace("DIO", "IOID");
            name = inst[sigObj.ioid];
        }

        pinInstance.push({
            name: "pinInstance" + i,
            displayName: "PIN Configuration While Pin is Not In Use",
            moduleName: "/ti/drivers/PIN",
            collapsed: true,
            args: {
                $name: name,
                ioid: io,
                mode: "Output",
                outputStrength: "Maximum",
                outputState: "Low",
                outputType: "Push/Pull"
            }
        });
        i += 1;
    }
    return pinInstance;
}

/* Add the pin symbol configurables */
addPinSymbolConfigurables();

/*
 *  ======== extend ========
 *  Extends a base exports object to include any device specifics
 *
 *  This function is invoked by the generic RF module to
 *  allow us to augment/override as needed for the CC26XX
 */
function extend(base)
{
    /* merge and overwrite base module attributes */
    return(Object.assign({}, base, rfdriver));
}

/*
 *  ======== exports ========
 *  Export device-specific extensions to base exports
 */
exports = {
    /* required function, called by generic RF module */
    extend: extend
};
