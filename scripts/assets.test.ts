import { assetUsers, removeAsset } from '@openrive/rive/assets';
import { newDoc, obj } from '@openrive/rive/factory';

const doc = newDoc('Asset cleanup');
const ab = doc.artboards[0]!;
const script = obj('ScriptAsset', { name: 'Listener script' }, []);
doc.top.push(script);
const action = obj('ScriptedListenerAction', { scriptAssetId: script.id });
const listener = obj('StateMachineListener', {}, [action]);
ab.stateMachines[0]!.children!.push(listener);

if (assetUsers(doc, script.id).length !== 1) {
  throw new Error('Asset usage must include nested state-machine script actions');
}
if (!removeAsset(doc, script.id)) throw new Error('The script asset should be removable');
if (doc.top.some((item) => item.id === script.id) || listener.children?.includes(action)) {
  throw new Error('Removing a script asset must remove its nested script actions');
}

const image = obj('ImageAsset', { name: 'VM image' }, []);
const imageValue = obj('ViewModelInstanceAsset', { propertyValue: image.id });
doc.top.push(image, imageValue);
if (!removeAsset(doc, image.id) || imageValue.props.propertyValue !== -1) {
  throw new Error('Removing an asset must clear top-level view-model asset values');
}

const font = obj('FontAsset', { name: 'In-use font' }, []);
doc.top.push(font);
ab.objects.push(obj('TextStyle', { parentId: ab.id, fontAssetId: font.id }));
if (removeAsset(doc, font.id) || !doc.top.includes(font)) {
  throw new Error('A font still used by text must remain in the document');
}

console.log('Asset usage and cleanup tests passed');
