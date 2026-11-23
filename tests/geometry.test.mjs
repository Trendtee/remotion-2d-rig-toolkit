import test from 'node:test';
import assert from 'node:assert/strict';
import {point, distance, rotate, solveTwoBoneArm, sampleScalar, samplePoint,
  placePropAtBase, placePropAtGrip, worldAnchor, checkPickupContact,
  samplePropInteraction, createHandGeometry, moveHandGeometry, sortGripLayers} from '../dist/index.js';

const close = (a,b,eps=1e-6) => assert.ok(Math.abs(a-b)<eps, `Expected ${a} ≈ ${b}`);

test('two-bone IK reaches an in-range target while preserving bone lengths', () => {
  const result = solveTwoBoneArm({shoulder: point(0,0),upperArmLength:70,forearmLength:60,elbowSide:'left'},point(80,25));
  assert.equal(result.targetReachable,true);
  close(distance(result.shoulder,result.elbow),70);
  close(distance(result.elbow,result.wrist),60);
  close(distance(result.wrist,point(80,25)),0);
});

test('unreachable IK target is clamped without stretching bones', () => {
  const result = solveTwoBoneArm({shoulder:point(10,20),upperArmLength:40,forearmLength:35,elbowSide:'right'},point(500,20));
  assert.equal(result.targetReachable,false);
  close(distance(result.shoulder,result.wrist),75);
  close(distance(result.shoulder,result.elbow),40);
  close(distance(result.elbow,result.wrist),35);
});

test('IK handles coincident shoulder/target without NaN',()=>{
  const result = solveTwoBoneArm({shoulder:point(0,0),upperArmLength:25,forearmLength:25,elbowSide:'right'},point(0,0));
  close(distance(result.shoulder,result.elbow),25);
  close(distance(result.elbow,result.wrist),25);
});

test('IK rejects nonfinite coordinates and nonpositive lengths',()=>{
  assert.throws(()=>solveTwoBoneArm({shoulder:point(0,0),upperArmLength:-1,forearmLength:20,elbowSide:'left'},point(10,10)),RangeError);
  assert.throws(()=>solveTwoBoneArm({shoulder:point(Infinity,0),upperArmLength:10,forearmLength:20,elbowSide:'left'},point(10,10)),RangeError);
});

test('rotation is deterministic and preserves lengths',()=>{
  const p=rotate(point(10,0),90);
  close(p.x,0); close(p.y,10);
});

test('keyframe values interpolate and clamp at endpoints',()=>{
  const keys=[{frame:0,value:0},{frame:10,value:100}];
  close(sampleScalar(keys,-12),0);
  close(sampleScalar(keys,5),50);
  close(sampleScalar(keys,12),100);
  close(samplePoint([{frame:0,value:point(0,0)},{frame:10,value:point(10,20)}],5).y,10);
  assert.throws(()=>sampleScalar([{frame:10,value:1},{frame:5,value:2}],8));
});

test('prop anchors land exactly on requested world points',()=>{
  const prop={width:60,height:90,gripAnchor:point(50,25),baseAnchor:point(30,80)};
  const atBase=placePropAtBase(prop,point(200,250),1.2,30);
  close(distance(worldAnchor(atBase,prop.baseAnchor),point(200,250)),0);
  const atGrip=placePropAtGrip(prop,point(120,100),0.7,-20);
  close(distance(worldAnchor(atGrip,prop.gripAnchor),point(120,100)),0);
});

test('contact validation detects mismatch before pickup',()=>{
  const prop={width:50,height:60,gripAnchor:point(35,15),baseAnchor:point(20,55)};
  const initialBase=point(200,300);
  const expectedGrip=point(215,260);
  const good={prop,initialBase,pickupFrame:10,releaseFrame:20,gripAtFrame:()=>expectedGrip};
  assert.equal(checkPickupContact(good).ok,true);
  assert.equal(checkPickupContact({...good,gripAtFrame:()=>point(100,100)}).ok,false);
});

test('pickup and release continuity with explicit contact',()=>{
  const prop={width:50,height:60,gripAnchor:point(35,15),baseAnchor:point(20,55)};
  const grip0=point(215,260);
  const grip1=point(305,260);
  const interaction={prop,initialBase:point(200,300),pickupFrame:10,releaseFrame:20,
    gripAtFrame:f=>f<=10?grip0:point(grip0.x+(f-10)*9,grip0.y),
    finalBase:point(290,300),settleFrames:10};
  const before=samplePropInteraction(interaction,9).pose;
  const pickup=samplePropInteraction(interaction,10).pose;
  close(distance(before.topLeft,pickup.topLeft),0);
  close(distance(samplePropInteraction(interaction,19.999).pose.topLeft,
                 samplePropInteraction(interaction,20).pose.topLeft),0.009);
  close(distance(worldAnchor(samplePropInteraction(interaction,30).pose,prop.baseAnchor),point(290,300)),0);
  assert.equal(samplePropInteraction(interaction,15).phase,'held');
  assert.equal(samplePropInteraction(interaction,24).phase,'settling');
  assert.equal(samplePropInteraction(interaction,35).phase,'released');
});

test('five separate named digits, mirroring and front/back layers',()=>{
  const right=createHandGeometry('handle','right');
  const left=createHandGeometry('handle','left');
  assert.deepEqual(right.fingers.map(f=>f.digit),['thumb','index','middle','ring','pinky']);
  close(right.fingers[1].tip.x,-left.fingers[1].tip.x);
  assert.equal(right.fingers[0].layer,'front');
  assert.equal(right.fingers[1].layer,'back');
  close(moveHandGeometry(right,point(100,80)).fingers[0].tip.x,right.fingers[0].tip.x+100);
});

test('draw ordering is deterministic',()=>{
  const order=sortGripLayers([{layer:'frontFingers'},{layer:'object'},{layer:'rearFingers'}]);
  assert.deepEqual(order.map(o=>o.layer),['rearFingers','object','frontFingers']);
});
