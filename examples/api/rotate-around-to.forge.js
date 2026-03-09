// rotateAroundTo() — solve the angle around an axis from geometry instead of manual trig.

function makeArm(color) {
  return box(80, 8, 8, true)
    .translate(40, 0, 0)
    .color(color)
    .withReferences({
      points: {
        tip: [80, 0, 0],
      },
    });
}

function makeScene(offsetX, targetPoint, options, color) {
  const pivot = [offsetX, 0, 0];
  const arm = makeArm('#7c8794').translate(offsetX, 0, 0);
  const solved = arm.rotateAroundTo([0, 0, 1], pivot, 'tip', targetPoint, options).color(color);

  return [
    { name: `${color} Axis`, shape: cylinder(90, 1.4).translate(offsetX, 0, 45).color('#999999') },
    { name: `${color} Pivot`, shape: cylinder(6, 8).translate(offsetX, 0, -3).color('#555555') },
    { name: `${color} Start`, shape: arm.translate(0, 0, -7) },
    { name: `${color} Solved`, shape: solved.translate(0, 0, 7) },
    { name: `${color} Target`, shape: sphere(3).translate(targetPoint[0], targetPoint[1], targetPoint[2]).color('#cc4444') },
  ];
}

return [
  ...makeScene(-70, [-38, 32, 24], { mode: 'plane' }, '#4a90e2'),
  ...makeScene(70, [102, 32, 0], { mode: 'line' }, '#4cc48a'),
];
