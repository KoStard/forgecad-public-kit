So we have a web app, which has a code panel that we enter manually and based on that it regenerates the model.
But I think we should make it more interactive.
For example, we should add a console view, without opening dev tools, so that I can do `console.log(xyz)` in the code and see some results.

Then, another part is that we underestimated how much will be happening inside a sketch. In Fusion360 after you create a sketch, you choose which of the areas you want to choose for extrusion or something else. Meaning, one sketch might produce multiple areas. And this is created by the collision of lines, etc. This is not handled at all currently. Maybe after we import, we should be able to say sketch.area1 for our modifications. I think this is necessary to think through.
Maybe this needs to be handled better in the 2d sketch editor. Maybe in the code we combine and exclude the surfaces we want. At the same time, we should have a reliable and adjustable way to name areas, which shouldn't completely break after we make changes. Area 1 should stay area 1, even if some other things change. Maybe we should let manual selection of the surfaces, but it kind of breaks the point that it needs to be LLM-friendly. Maybe instead a given area can be determined by "checkpoint" points/edges, which get marked while the surface is being created. Like while creating a path, we set marker on it.

