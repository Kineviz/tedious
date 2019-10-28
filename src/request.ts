import { EventEmitter } from 'events';
import { typeByName as TYPES, Parameter } from './data-type';
import { RequestError } from './errors';

import Connection from './connection';

// TODO: Figure out how to type the `rows` parameter here.
/**
 * <code>function (err, rowCount, rows) { }</code>
  <p>
    The callback is called when the request has completed, either successfully or with an error.
    If an error occurs during execution of the statement(s), then <code>err</code> will describe the error.
  </p>
  <p>
    As only one request at a time may be executed on a connection, another request should not
    be initiated until this callback is called.
  </p>
  <p>This callback is called before requestCompleted event is emitted.</p>
    <dl>
    <dt><code>error</code></dt>
    <dd><p>If an error occured, an error object.</p></dd>

    <dt><code>rowCount</code></dt>
    <dd><p>The number of rows emitted as result of executing the SQL statement.</p></dd>

    <dt><code>rows</code></dt>
    <dd><p>Rows as a result of executing the SQL statement.</p>
    <p>Will only be avaiable if Connection's
    <code>config.options.rowCollectionOnRequestCompletion</code>
    is <code>true</code>.</p></dd>
  </dl>
 */
type CompletionCallback = (error: Error | null | undefined, rowCount?: number, rows?: any) => void;

type ParameterOptions = {
  output?: boolean,
  length?: number,
  precision?: number,
  scale?: number
}

/**
 * ```js
 * let Request = require('tedious').Request;
 * request = new Request("select 42, 'hello world'", function(err, rowCount) {...});
 * connection.execSql(request);
 * ```
  @noInheritDoc
*/
class Request extends EventEmitter {
  /** @ignore */sqlTextOrProcedure?: string;
  /** @ignore */parameters: Parameter[];
  /** @ignore */parametersByName: { [key: string]: Parameter };
  /** @ignore */originalParameters: Parameter[];
  /** @ignore */preparing: boolean;
  /** @ignore */canceled: boolean;
  /** @ignore */paused: boolean;
  /** @ignore */userCallback: CompletionCallback;
  /** @ignore */handle?: number;
  /** @ignore */error?: Error;
  /** @ignore */connection?: Connection;
  /** @ignore */timeout?: number;

  /** @ignore */rows?: Array<any>;
  /** @ignore */rst?: Array<any>;
  /** @ignore */rowCount?: number;

  /** @ignore */callback: CompletionCallback;

  /**
   * <code> request.on('columnMetadata', function (columns) {...}); </code></br>
   * </br>
   * This event, describing result set columns, will be emitted before row events are emitted. This event may be emited multiple times when more than one recordset is produced by the statement.
   *<p>
      An array like object, where the columns can be accessed either by index or name.
      Columns with a name that is an integer are not accessible by name,
      as it would be interpreted as an array index.
    </p>
    <p>Each column has these properties.</p>
    <dl>
      <dt><code>colName</code></dt>
      <dd>The column's name.</dd>

      <dt><code>type.name</code></dt>
      <dd>The column's type, such as VarChar, Int or Binary.</dd>

      <dt><code>precision</code></dt>
      <dd>The precision. Only applicable to numeric and decimal.</dd>

      <dt><code>scale</code></dt>
      <dd>The scale. Only applicable to numeric, decimal, time, datetime2 and datetimeoffset.</dd>

      <dt><code>dataLength</code></dt>
      <dd>The length, for char, varchar, nvarchar and varbinary.</dd>
    </dl>
   * @event
   */
  Event_columnMetadata?: 'columnMetadata';

  /**
   * <code> request.on('prepared', function () {...}); </code></br>
   * </br>
   * The request has been prepared and can be used in subsequent calls to execute and unprepare.
   * @event
   */
  Event_prepared?: 'prepared';

  /**
   * <code> request.on('error', function (err) {...}); </code></br>
   * </br>
   * The request encountered an error and has not been prepared.
   * @event
   */
  Event_error?: 'error';

  /**
   * <code> request.on('row', function (columns) {...}); </code></br>
   * </br>
   * A row resulting from execution of the SQL statement.
   *
    <p> An array or object (depends on <code>config.options.useColumnNames</code>), where the columns can be accessed by index/name.
      Each column has two properties, <code>metadata</code> and <code>value</code>.</p>
    <dl>
      <dt><code>metadata</code></dt>
      <dd>The same data that is exposed in the <code>columnMetadata</code> event.</dd>

      <dt><code>value</code></dt>
      <dd><p>The column's value.It will be <code>null</code> for a <code>NULL</code>.</p>
          <p>If there are multiple columns with the same name, then this will be an array of the values.</p>
      </dd>
    </dl>
   * @event
   */
  Event_row?: 'row';

  /**
   * <code> request.on('done', function (rowCount, more, rows) { }) </code>;</br>
   * </br>
   * All rows from a result set have been provided (through row events).
   * This token is used to indicate the completion of a SQL statement.
   * As multiple SQL statements can be sent to the server in a single SQL batch, multiple done events can be generated.
   * An done event is emited for each SQL statement in the SQL batch except variable declarations.
   * For execution of SQL statements within stored procedures, doneProc and doneInProc events are used in place of done events.</br>
   * </br>
   * If you are using execSql then SQL server may treat the multiple calls with the same query as a stored procedure.
   * When this occurs, the doneProc or doneInProc events may be emitted instead. You must handle both events to ensure complete coverage.
   <dl>
   <dt><code>rowCount</code></dt>
   <dd><p>The number of result rows. May be <code>undefined</code> if not available.</p></dd>

   <dt><code>more</code></dt>
   <dd><p>If there are more results to come (probably because multiple statements are being executed), then <code>true</code>.</p></dd>

   <dt><code>rows</code>
   <dd><p>Rows as a result of executing the SQL statement.</p>
        <p> Will only be avaiable if Connection's <code>config.options.rowCollectionOnDone</code> is <code>true</code>. </p></code></dt>
   </dd>
   </dl>
   * @event
   */
  Event_done?: 'done';

  /**
   * <code>request.on('doneInProc', function (rowCount, more, rows) { });</code>
   * <p>
  Indicates the completion status of a SQL statement within a stored procedure. All rows from a statement
  in a stored procedure have been provided (through <code>row</code> events).
  </p>
  <p>
  This event may also occur when executing multiple calls with the same query using
  <code>execSql</code>.
  </p>
  <dl>
    <dt><code>rowCount</code></dt>
    <dd><p>The number of result rows. May be <code>undefined</code> if not available. </p></dd>

    <dt><code>more</code></dt>
    <dd><p>If there are more result sets to come, then <code>true</code>.</p></dd>

    <dt><code>rows</code></dt>
    <dd><p>Rows as a result of executing the SQL.</p>
        <p>Will only be avaiable if Connection's <code>config.options.rowCollectionOnDone</code> is <code>true</code>.</p>
    </dd>
  </dl>
   * @event
   */
  Event_doneInProc?: 'doneInProc';

  /**
   * <code>request.on('doneProc', function (rowCount, more, returnStatus, rows) { }); </code>
   * <p>Indicates the completion status of a stored procedure. This is also generated for stored procedures
  executed through SQL statements.</p>
    <p>This event may also occur when executing multiple calls with the same query using
      <code>execSql</code>.</p>
    <dl>
      <dt><code>rowCount</code></dt>
      <dd><p>The number of result rows. May be <code>undefined</code> if not available. </p>
      </dd>

      <dt><code>more</code></dt>
      <dd><p>If there are more result sets to come, then <code>true</code>.</p>
      </dd>

      <dt><code>returnStatus</code></dt>
      <dd> <p>The value returned from a stored procedure.</p>
      </dd>

      <dt><code>rows</code></dt>
      <dd> <p>Rows as a result of executing the SQL.</p>
            <p> Will only be avaiable if Connection's <code>config.options.rowCollectionOnDone</code> is <code>true</code>.</p>
      </dd>
    </dl>
   * @event
   */
  Event_doneProc?: 'doneProc';

  /**
   * <code>request.on('returnValue', function (parameterName, value, metadata) { });</code>
   * <p>A value for an output parameter (that was added to the request with <code>addOutputParameter(...)</code>).</p>
    <p>See also <code>Using Parameters</code>.</p>
    <dl>
      <dt><code>parameterName</code></dt>
      <dd><p>The parameter name. (Does not start with '@'.)</p>
      </dd>

      <dt><code>value</code></dt>
      <dd><p>The parameter's output value.</p>
      </dd>

      <dt><code>metadata</code></dt>
      <dd><p>The same data that is exposed in the <code>columnMetadata</code> event.</p>
      </dd>
    </dl>
   * @event
   */
  Event_returnValue?: 'returnValue';

  /**
   * <code>request.on('order', function (orderColumns) { });</code>
   * <p>This event gives the columns by which data is ordered, if <code>ORDER BY</code> clause is executed in SQL Server.</p>

   <dt><code>orderColumns</code></dt>
   <dd><p>An array of column numbers in the result set by which data is ordered.</p>

   * @event
   */
  Event_order?: 'order';


  /**
   * <code>request = new Request("select 42, 'hello world'", function(err, rowCount) {...});</code>
   * @param sqlTextOrProcedure The SQL statement to be executed
   * @param callback
   */
  constructor(sqlTextOrProcedure: string | undefined, callback: CompletionCallback) {
    super();

    this.sqlTextOrProcedure = sqlTextOrProcedure;
    this.parameters = [];
    this.parametersByName = {};
    this.originalParameters = [];
    this.preparing = false;
    this.handle = undefined;
    this.canceled = false;
    this.paused = false;
    this.error = undefined;
    this.connection = undefined;
    this.timeout = undefined;
    this.userCallback = callback;
    this.callback = function(err: Error | undefined | null, rowCount?: number, rows?: any) {
      if (this.preparing) {
        this.preparing = false;
        if (err) {
          this.emit('error', err);
        } else {
          this.emit('prepared');
        }
      } else {
        this.userCallback(err, rowCount, rows);
        this.emit('requestCompleted');
      }
    };
  }

  // TODO: `type` must be a valid TDS value type
  /**
   * <code>request.addParameter('city', TYPES.VarChar, 'London');</code></br>
   * </br>
   * @param name The parameter name. This should correspond to a parameter in the SQL, or a parameter that a called procedure expects.
   *             The name should not start '@'.
   * @param type One of the supported data types.
   * @param value The value that the parameter is to be given. The Javascript type of the argument should match that documented for data types.
   * @param options Additional type options. Optional.
   */
  addParameter(name: string, type: any, value: unknown, options?: ParameterOptions) {
    if (options == null) {
      options = {};
    }

    const { output = false, length, precision, scale } = options;

    const parameter: Parameter = {
      type: type,
      name: name,
      value: value,
      output: output,
      length: length,
      precision: precision,
      scale: scale
    };
    this.parameters.push(parameter);
    this.parametersByName[name] = parameter;
  }

  // TODO: `type` must be a valid TDS value type
  /**
   * <code>request.addOutputParameter('id', TYPES.Int);</code></br>
   * </br>
   * @param name The parameter name. This should correspond to a parameter in the SQL, or a parameter that a called procedure expects.
   * @param type One of the supported data types.
   * @param value The value that the parameter is to be given. The Javascript type of the argument should match that documented for data types
   * @param options Additional type options. Optional.
   */
  addOutputParameter(name: string, type: any, value?: unknown, options?: ParameterOptions) {
    if (options == null) {
      options = {};
    }
    options.output = true;
    this.addParameter(name, type, value, options);
  }

  /** @private */
  makeParamsParameter(parameters: Parameter[]) {
    let paramsParameter = '';
    for (let i = 0, len = parameters.length; i < len; i++) {
      const parameter = parameters[i];
      if (paramsParameter.length > 0) {
        paramsParameter += ', ';
      }
      paramsParameter += '@' + parameter.name + ' ';
      paramsParameter += parameter.type.declaration(parameter);
      if (parameter.output) {
        paramsParameter += ' OUTPUT';
      }
    }
    return paramsParameter;
  }

  /** @private */
  transformIntoExecuteSqlRpc() {
    if (this.validateParameters()) {
      return;
    }

    this.originalParameters = this.parameters;
    this.parameters = [];
    this.addParameter('statement', TYPES.NVarChar, this.sqlTextOrProcedure);
    if (this.originalParameters.length) {
      this.addParameter('params', TYPES.NVarChar, this.makeParamsParameter(this.originalParameters));
    }

    for (let i = 0, len = this.originalParameters.length; i < len; i++) {
      const parameter = this.originalParameters[i];
      this.parameters.push(parameter);
    }
    this.sqlTextOrProcedure = 'sp_executesql';
  }

  /** @private */
  transformIntoPrepareRpc() {
    this.originalParameters = this.parameters;
    this.parameters = [];
    this.addOutputParameter('handle', TYPES.Int, undefined);
    this.addParameter('params', TYPES.NVarChar, this.makeParamsParameter(this.originalParameters));
    this.addParameter('stmt', TYPES.NVarChar, this.sqlTextOrProcedure);
    this.sqlTextOrProcedure = 'sp_prepare';
    this.preparing = true;
    this.on('returnValue', (name: string, value: any) => {
      if (name === 'handle') {
        this.handle = value;
      } else {
        this.error = RequestError(`Tedious > Unexpected output parameter ${name} from sp_prepare`);
      }
    });
  }

  /** @private */
  transformIntoUnprepareRpc() {
    this.parameters = [];
    this.addParameter('handle', TYPES.Int, this.handle);
    this.sqlTextOrProcedure = 'sp_unprepare';
  }

  /** @private */
  transformIntoExecuteRpc(parameters: { [key: string]: unknown }) {
    this.parameters = [];
    this.addParameter('handle', TYPES.Int, this.handle);

    for (let i = 0, len = this.originalParameters.length; i < len; i++) {
      const parameter = this.originalParameters[i];
      parameter.value = parameters[parameter.name];
      this.parameters.push(parameter);
    }

    if (this.validateParameters()) {
      return;
    }

    this.sqlTextOrProcedure = 'sp_execute';
  }

  /** @private */
  validateParameters() {
    for (let i = 0, len = this.parameters.length; i < len; i++) {
      const parameter = this.parameters[i];
      const value = parameter.type.validate(parameter.value);
      if (value instanceof TypeError) {
        return this.error = new RequestError('Validation failed for parameter \'' + parameter.name + '\'. ' + value.message, 'EPARAM');
      }
      parameter.value = value;
    }
    return null;
  }

  /**
   * <code>request.pause();</code></br>
   * </br>
   * Temporarily suspends the flow of data from the database. No more 'row' events will be emitted until request.resume() is called.
   * If this request is already in a paused state, calling pause() has no effect.
   */
  pause() {
    if (this.paused) {
      return;
    }
    this.paused = true;
    if (this.connection) {
      this.connection.pauseRequest(this);
    }
  }

  /**
   * <code>request.resume();</code></br>
   * </br>
   * Resumes the flow of data from the database.
   * If this request is not in a paused state, calling resume() has no effect.
   */
  resume() {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    if (this.connection) {
      this.connection.resumeRequest(this);
    }
  }
  /**
   * <code>request.cancel();</code></br>
   * </br>
   * Cancels a request while waiting for a server response.
   */
  cancel() {
    if (this.canceled) {
      return;
    }

    this.canceled = true;
    this.emit('cancel');
  }

  /**
   * <code>request.setTimeout(timeout);</code></br>
   * </br>
   * Sets a timeout for this request.
   * <dt><code>timeout</code></dt>
   * <dd><p>The number of milliseconds before the request is considered failed, or 0 for no timeout.</p>
   *   <p>When no timeout is set for the request, the <code>options.requestTimeout</code> of the <code>Connection</code> is used.</p>
   * </dd>
   * @param timeout
   */
  setTimeout(timeout?: number) {
    this.timeout = timeout;
  }
}

export default Request;
module.exports = Request;
