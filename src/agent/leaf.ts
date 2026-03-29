export class Leaf {
  constructor(public id: string) {}
}

export type LeafEvent = { added: Leaf } | { removed: Leaf };
