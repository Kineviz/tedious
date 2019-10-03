import Request from './request';
import BulkLoad from './bulk-load';
import { Metadata } from './metadata-parser';

// export type InternalConnectionOptions = {
//   camelCaseColumns: boolean,
//   columnNameReplacer?: (colName: string, index: number, metadata: Metadata) => string,
//   tdsVersion: string,
//   useColumnNames: boolean,
//   useUTC: boolean,
// };

export declare class Connection {
  pauseRequest(request: Request | BulkLoad): void;
  resumeRequest(request: Request | BulkLoad): void;
}

export interface ConfigOptions {

}