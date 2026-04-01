While having good set of primitives is important, we should allow the user to create custom shapes by combining them etc.
For example, this is a challenge for you.
Build a simple iphone CAD.
Steps:
- Build a sketch file
- There add a rectangle
- Add 4 circles at the edges
- [do something]
- In 3d file, extrude the "rounded corner rectangle" to certain heigh

Extra points:
- Add camera on the bottom? Maybe during sketching add another circle for extruding as camera?
- Add a charging port
- Add speaker and mic linear pattern holes
- Add buttons

While you try to implement these, you'll face significant challenges from the limitations of the system. Identifying the bottleneck and addressing it is actually the real purpose of this exercise.
Make it so doing this is as easy as in Fusion360. Get inspiration from them as much as possible.
I also want the system to be so flexible that a missing feature can be implemented inside the script itself, so keeping it open ended.
Understand where do the bottlenecks come from. Is it dependencies? Should we implement inhouse some dependencies? How hard would it be?
Document everything you learn and figure out in docs/temporary/iphone/...
