/**
 * Created by Jerome Renaux (jerome.renaux@gmail.com) on 31-08-19.
 */
import BigButton from './BigButton'
import Engine from './Engine'
import {BigProgressBar} from './ProgressBar'
import Panel from './Panel'
import Utils from '../shared/Utils'

import itemsData from '../assets/data/items.json' assert { type: 'json' }

function RepairPanel(x,y,width,height,title){
    Panel.call(this,x,y,width,height,title);
    this.texts = [];
    this.bigbuttons = [];
    this.addInterface();
}

RepairPanel.prototype = Object.create(Panel.prototype);
RepairPanel.prototype.constructor = RepairPanel;

RepairPanel.prototype.addInterface = function(){
    this.addText(this.width/2,25,'Building integrity',null,20).setOrigin(0.5);
    var barw = this.width-100;
    var barx = (this.width-barw)/2;
    this.bar = new BigProgressBar(this.x+barx,this.y+50,barw,'gold');
    this.bar.moveUp(2);
    this.bar.name = 'repair progress bar';
};

RepairPanel.prototype.displayInterface = function(){
    this.bar.display();
    this.displayTexts();

    var slot = this.getNextLongSlot();
    var y = this.y + 100;
    slot.setUp(this.x+20, y);
    var item = 3; // timber
    var itemData = itemsData[item];
    slot.addIcon(itemData.atlas,itemData.frame);
    slot.addText(43,2,itemData.name,null,13);

    var player_owned = Engine.player.getItemNb(item);
    var txt = slot.addText(152,slot.height-3,player_owned,Utils.colors.white,13);
    txt.setOrigin(1,1);
    slot.addImage(161, slot.height-10, 'UI', 'smallpack');

    var price = Engine.currentBuiling.getPrice(item,'buy');
    var priceTxt = price || '--';
    var t = slot.addText(152,12,priceTxt,Utils.colors.white,13);
    t.setOrigin(1,0.5);
    slot.addImage(160, 13, 'UI', 'gold');

    slot.moveUp(2);
    slot.display();

    var panel_ = this;
    var btn = new BigButton(this.x+270,y+20,'Give '+itemData.name);
    btn.item = item;
    btn.callback = function(){
        // if(panel_.checkForPanelOnTop()) return;
        Engine.repairAction.display();
        Engine.repairAction.setUp(this.item,'sell',false); // false = force non-financial
    }.bind(btn);
    btn.display();
    // if(Engine.currentBuiling.isFullyRepaired()) btn.disable();
    this.bigbuttons.push(btn);

    if(!Engine.currentBuiling.isOwned() && price > 0) {
        var btn = new BigButton(this.x + 410, y + 20, 'Sell ' + itemData.name);
        btn.item = item;
        btn.callback = function(){
            // if(panel_.checkForPanelOnTop()) return;
            Engine.repairAction.display();
            Engine.repairAction.setUp(this.item,'sell',true); // true = force financial
        }.bind(btn);
        btn.display();
        if(Engine.currentBuiling.isFullyRepaired()) btn.disable();
        this.bigbuttons.push(btn);
    }

    this.bigbuttons.forEach(function(btn){
        btn.moveUp(2);
    });

    this.bar.setLevel(Engine.currentBuiling.stats['hp'].getValue(),Engine.currentBuiling.stats['hpmax'].getValue());
};

RepairPanel.prototype.update = function(){
    this.hideLongSlots();
    this.bigbuttons.forEach(function(btn){
        btn.hide();
    });
    this.displayInterface();
};

RepairPanel.prototype.hideInterface = function(){
    this.bar.hide();
    this.bigbuttons.forEach(function(b){
        b.hide();
    });
    this.hideTexts();
    this.hideLongSlots();
};

RepairPanel.prototype.display = function(){
    Panel.prototype.display.call(this);
    this.displayInterface();
};

RepairPanel.prototype.hide = function(){
    Panel.prototype.hide.call(this);
    Engine.repairAction.hide();
    this.hideInterface();
};

export default RepairPanel