/**
 * Find min and max of a numeric array without spread operator.
 * Math.min(...arr) / Math.max(...arr) causes stack overflow at ~65K elements.
 */
export function findMin(data: number[]): number {
    if (data.length === 0) return 0;
    let min = data[0];
    for (let i = 1; i < data.length; i++) {
        if (data[i] < min) min = data[i];
    }
    return min;
}

export function findMax(data: number[]): number {
    if (data.length === 0) return 0;
    let max = data[0];
    for (let i = 1; i < data.length; i++) {
        if (data[i] > max) max = data[i];
    }
    return max;
}

export function findMinMax(data: number[]): [number, number] {
    if (data.length === 0) return [0, 0];
    let min = data[0], max = data[0];
    for (let i = 1; i < data.length; i++) {
        if (data[i] < min) min = data[i];
        if (data[i] > max) max = data[i];
    }
    return [min, max];
}
