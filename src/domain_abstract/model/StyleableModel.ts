import { isArray, isObject, isString, keys } from 'underscore';
import { Model, ObjectAny, ObjectHash, SetOptions } from '../../common';
import ParserHtml from '../../parser/model/ParserHtml';
import Selectors from '../../selector_manager/model/Selectors';
import { shallowDiff } from '../../utils/mixins';
import EditorModel from '../../editor/model/Editor';
import CssRuleView from '../../css_composer/view/CssRuleView';
import ComponentView from '../../dom_components/view/ComponentView';
import Frame from '../../canvas/model/Frame';
import { ToCssOptions } from '../../css_composer/model/CssRule';
import { ModelDataResolverWatchers } from '../../dom_components/model/ModelDataResolverWatchers';
import { DataCollectionStateMap } from '../../data_sources/model/data_collection/types';
import { DataWatchersOptions } from '../../dom_components/model/ModelResolverWatcher';
import { DataResolverProps } from '../../data_sources/types';
import { _StringKey } from 'backbone';

export type StyleProps = Record<string, string | string[] | DataResolverProps>;

export interface UpdateStyleOptions extends SetOptions, DataWatchersOptions {
  partial?: boolean;
  addStyle?: StyleProps;
  inline?: boolean;
  noEvent?: boolean;
}

export type StyleableView = ComponentView | CssRuleView;

const parserHtml = ParserHtml();

export const getLastStyleValue = (value: string | string[]) => {
  return isArray(value) ? value[value.length - 1] : value;
};

export interface StyleableModelProperties extends ObjectHash {
  selectors?: any;
  style?: StyleProps | string;
}

export interface GetStyleOpts {
  skipResolve?: boolean;
}

type WithDataResolvers<T> = {
  [P in keyof T]?: T[P] | DataResolverProps;
};

export default class StyleableModel<T extends StyleableModelProperties = any> extends Model<T, UpdateStyleOptions> {
  em?: EditorModel;
  views: StyleableView[] = [];
  dataResolverWatchers: ModelDataResolverWatchers<T>;
  collectionsStateMap: DataCollectionStateMap = {};
  opt: { em?: EditorModel };

  constructor(attributes: T, options: { em?: EditorModel } = {}) {
    const em = options.em!;
    const dataResolverWatchers = new ModelDataResolverWatchers<T>(undefined, { em });
    super(attributes, { ...options, dataResolverWatchers });
    dataResolverWatchers.bindModel(this);
    this.dataResolverWatchers = dataResolverWatchers;
    this.em = options.em;
    this.opt = options;
  }

  get<A extends _StringKey<T>>(attributeName: A, opts?: { skipResolve?: boolean }): T[A] | undefined {
    if (opts?.skipResolve) return this.dataResolverWatchers.getValueOrResolver('props')[attributeName];

    return super.get(attributeName);
  }

  set<A extends keyof T>(
    keyOrAttributes: A,
    valueOrOptions?: T[A] | DataResolverProps,
    optionsOrUndefined?: UpdateStyleOptions,
  ): this;
  set(keyOrAttributes: WithDataResolvers<T>, options?: UpdateStyleOptions): this;
  set<A extends keyof T>(
    keyOrAttributes: WithDataResolvers<T>,
    valueOrOptions?: T[A] | DataResolverProps | UpdateStyleOptions,
    optionsOrUndefined?: UpdateStyleOptions,
  ): this {
    const defaultOptions: UpdateStyleOptions = {
      skipWatcherUpdates: false,
      fromDataSource: false,
    };

    let attributes: WithDataResolvers<T>;
    let options: UpdateStyleOptions & { dataResolverWatchers?: ModelDataResolverWatchers<T> };

    if (typeof keyOrAttributes === 'object') {
      attributes = keyOrAttributes;
      options = (valueOrOptions as UpdateStyleOptions) || defaultOptions;
    } else if (typeof keyOrAttributes === 'string') {
      attributes = { [keyOrAttributes]: valueOrOptions } as Partial<T>;
      options = optionsOrUndefined || defaultOptions;
    } else {
      attributes = {};
      options = defaultOptions;
    }

    this.dataResolverWatchers = this.dataResolverWatchers ?? options.dataResolverWatchers;
    const evaluatedValues = this.dataResolverWatchers.addProps(attributes, options) as Partial<T>;

    return super.set(evaluatedValues, options);
  }

  /**
   * Parse style string to an object
   * @param  {string} str
   * @returns
   */
  parseStyle(str: string) {
    return parserHtml.parseStyle(str);
  }

  /**
   * Trigger style change event with a new object instance
   * @param {Object} prop
   * @return {Object}
   */
  extendStyle(prop: ObjectAny): ObjectAny {
    return { ...this.getStyle('', { skipResolve: true }), ...prop };
  }

  /**
   * Get style object
   * @return {Object}
   */
  getStyle(opts?: GetStyleOpts): StyleProps;
  getStyle(prop: '' | undefined, opts?: GetStyleOpts): StyleProps;
  getStyle<K extends keyof StyleProps>(prop: K, opts?: GetStyleOpts): StyleProps[K] | undefined;
  getStyle(
    prop?: keyof StyleProps | '' | ObjectAny,
    opts: GetStyleOpts = {},
  ): StyleProps | StyleProps[keyof StyleProps] | undefined {
    const rawStyle = this.get('style');
    const parsedStyle: StyleProps = isString(rawStyle)
      ? this.parseStyle(rawStyle)
      : isObject(rawStyle)
        ? { ...rawStyle }
        : {};

    delete parsedStyle.__p;

    const shouldReturnFull = !prop || prop === '' || isObject(prop);

    if (!opts.skipResolve) {
      return shouldReturnFull ? parsedStyle : parsedStyle[prop];
    }

    const unresolvedStyles: StyleProps = this.dataResolverWatchers.getValueOrResolver('styles', parsedStyle);

    return shouldReturnFull ? unresolvedStyles : unresolvedStyles[prop];
  }

  /**
   * Set new style object
   * @param {Object|string} prop
   * @param {Object} opts
   * @return {Object} Applied properties
   */
  setStyle(prop: string | ObjectAny = {}, opts: UpdateStyleOptions = {}) {
    if (isString(prop)) {
      prop = this.parseStyle(prop);
    }

    const propOrig = this.getStyle('', { skipResolve: true });

    if (opts.partial || opts.avoidStore) {
      opts.avoidStore = true;
      prop.__p = true;
    } else {
      delete prop.__p;
    }

    const propNew = { ...prop };
    let newStyle = { ...propNew };

    keys(newStyle).forEach((key) => {
      // Remove empty style properties
      if (newStyle[key] === '') {
        delete newStyle[key];
        return;
      }
    });
    const resolvedProps = this.dataResolverWatchers.addProps({ style: newStyle }, opts) as Partial<T>;
    this.set(resolvedProps, opts as any);
    newStyle = resolvedProps['style']! as StyleProps;

    const changedKeys = Object.keys(shallowDiff(propOrig, propNew));
    const diff: ObjectAny = changedKeys.reduce((acc, key) => {
      return {
        ...acc,
        [key]: newStyle[key],
      };
    }, {});
    // Delete the property used for partial updates
    delete diff.__p;

    keys(diff).forEach((pr) => {
      const { em } = this;
      if (opts.noEvent) {
        return;
      }

      this.trigger(`change:style:${pr}`);
      if (em) {
        em.trigger('styleable:change', this, pr, opts);
        em.trigger(`styleable:change:${pr}`, this, pr, opts);
      }
    });

    return newStyle;
  }

  getView(frame?: Frame) {
    let { views, em } = this;
    const frm = frame || em?.getCurrentFrameModel();
    return frm ? views.find((v) => v.frameView === frm.view) : views[0];
  }

  setView(view: StyleableView) {
    let { views } = this;
    !views.includes(view) && views.push(view);
  }

  removeView(view: StyleableView) {
    const { views } = this;
    views.splice(views.indexOf(view), 1);
  }

  updateView() {
    this.views.forEach((view) => view.updateStyles());
  }

  /**
   * Add style property
   * @param {Object|string} prop
   * @param {string} value
   * @example
   * this.addStyle({color: 'red'});
   * this.addStyle('color', 'blue');
   */
  addStyle(prop: string | ObjectAny, value: any = '', opts: UpdateStyleOptions = {}) {
    if (typeof prop == 'string') {
      prop = {
        [prop]: value,
      };
    } else {
      opts = value || {};
    }

    opts.addStyle = prop;
    prop = this.extendStyle(prop);
    this.setStyle(prop, opts);
  }

  /**
   * Remove style property
   * @param {string} prop
   */
  removeStyle(prop: string) {
    let style = this.getStyle();
    delete style[prop];
    this.setStyle(style);
  }

  /**
   * Returns string of style properties
   * @param {Object} [opts={}] Options
   * @return {String}
   */
  styleToString(opts: ToCssOptions = {}) {
    const result: string[] = [];
    const style = opts.style || (this.getStyle(opts as any) as StyleProps);
    const imp = opts.important;

    for (let prop in style) {
      const important = isArray(imp) ? imp.indexOf(prop) >= 0 : imp;
      const firstChars = prop.substring(0, 2);
      const isPrivate = firstChars === '__';

      if (isPrivate) continue;

      const value = style[prop];
      const values = isArray(value) ? (value as string[]) : [value];

      (values as string[]).forEach((val: string) => {
        const value = `${val}${important ? ' !important' : ''}`;
        value && result.push(`${prop}:${value};`);
      });
    }

    return result.join('');
  }

  getSelectors() {
    return (this.get('selectors') || this.get('classes')) as Selectors;
  }

  getSelectorsString(opts?: ObjectAny) {
    // @ts-ignore
    return this.selectorsToString ? this.selectorsToString(opts) : this.getSelectors().getFullString();
  }

  onCollectionsStateMapUpdate(collectionsStateMap: DataCollectionStateMap) {
    this.collectionsStateMap = collectionsStateMap;
    this.dataResolverWatchers.onCollectionsStateMapUpdate();
  }

  clone(attributes?: Partial<T>, opts?: any): typeof this {
    const props = this.dataResolverWatchers.getProps(this.attributes);
    const mergedProps = { ...props, ...attributes };
    const mergedOpts = { ...this.opt, ...opts };

    const ClassConstructor = this.constructor as new (attributes: any, opts?: any) => typeof this;

    return new ClassConstructor(mergedProps, mergedOpts);
  }

  toJSON(opts?: ObjectAny, attributes?: Partial<T>) {
    if (opts?.fromUndo) return { ...super.toJSON(opts) };
    const mergedProps = { ...this.attributes, ...attributes };
    const obj = this.dataResolverWatchers.getProps(mergedProps);

    return obj;
  }
}
