interface Function {
  name: string;
}

type LaneMeta = {
  start: boolean,
  ms: number,
  parent: number
}

type TapMeta = {
  origTap: number,
  ms: number
}

type NoteMeta = {
  is_on?: boolean,
  origTap: number,
  ms: number,
  level: number,
  velocity_coeff: number,
  note_incr: number,
  duration: number,
}