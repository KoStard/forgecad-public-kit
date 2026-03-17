// Side-effect imports: each file calls registerConstraint() at module load time.
import './coincident';
import './horizontal';
import './vertical';
import './parallel';
import './perpendicular';
import './tangent';
import './equal';
import './symmetric';
import './concentric';
import './collinear';
import './fixed';
import './midpoint';
import './pointOnCircle';
import './distance';
import './length';
import './angle';
import './radius';
import './diameter';
import './hDistance';
import './vDistance';
import './lineDistance';
import './absoluteAngle';
import './equalRadius';
import './arcLength';
import './lineTangentArc';
import './shapeCentroidX';
import './shapeCentroidY';
import './shapeWidth';
import './shapeHeight';
import './shapeArea';
import './shapeEqualCentroid';
import './pointOnLine';
import './pointLineDistance';
import './ccw';
import './angleBetween';

// Re-export named types that external code imports directly
export type { LineDistanceConstraint } from './lineDistance';
